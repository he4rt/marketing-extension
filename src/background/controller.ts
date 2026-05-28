import {
  extractInstagramComments,
  extractInstagramLikers,
  extractInstagramPublications,
  profileFromPublication,
} from "../providers/instagram/parser";
import { publicationKey } from "../providers/shared/utils";
import {
  accountInfoFromUser,
  accountInfoToTrackedProfile,
  favoriterToEngagement,
  processFavoritersPayload,
  processUserTweetsPayload,
} from "../providers/x/parser";
import type {
  BackgroundStore,
  ExportJSON,
  SocialComment,
  SocialEngagement,
  SocialMetrics,
  SocialProvider,
  SocialPublication,
} from "../shared/domain";
import type {
  CapturedPayloadMessage,
  RuntimeMessage,
  VisibleCommentsMessage,
} from "../shared/messages";

type AnyRecord = Record<string, any>;

export type MessageContext = {
  log?: (message: string) => void;
  persistHandle?: (handle: string) => void;
};

export function createStore(trackedHandle = ""): BackgroundStore {
  return {
    activeProvider: null,
    archivedEndpoints: {},
    trackedHandle,
    endpoints: {},
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
    instagramPublicationIdsByShortcode: {},
    instagramVisiblePublications: [],
    instagramVisibleComments: [],
    communityReplies: {},
    trackedProfiles: {},
    nextCaptureOrder: 1,
    pageSessionKey: "",
    tweets: {},
    favoriters: {},
    accountInfo: null,
    lastUpdated: null,
    pageSessionKeys: {},
    providerPageUrls: {},
  };
}

function getEndpointStore(store: BackgroundStore, provider: SocialProvider, endpoint: string) {
  const key = `${provider}:${endpoint}`;
  if (!store.endpoints[key]) {
    store.endpoints[key] = { provider, endpoint, payloads: [], count: 0, lastSeen: null };
  }
  return store.endpoints[key];
}

function normalizeCapture(request: RuntimeMessage): CapturedPayloadMessage | null {
  if (request.action === "CAPTURED_PAYLOAD") return request;
  if (request.action === "GRAPHQL_CAPTURED") {
    return {
      action: "CAPTURED_PAYLOAD",
      provider: request.provider || "x",
      endpoint: request.endpoint,
      payload: request.payload,
      timestamp: request.timestamp,
      pageUrl: request.pageUrl,
      url: request.url,
    };
  }
  return null;
}

function emptyMetrics(): SocialMetrics {
  return {
    bookmark_count: 0,
    comment_count: 0,
    like_count: 0,
    quote_count: 0,
    reply_count: 0,
    repost_count: 0,
    retweet_count: 0,
    save_count: 0,
    view_count: 0,
  };
}

function instagramPlaceholderPublication(
  item: BackgroundStore["instagramVisiblePublications"][number],
  visibleOrder: number,
): SocialPublication {
  const mediaType =
    item.mediaType ||
    (item.url.includes("/reel/") || item.url.includes("/reels/") ? "reel" : "unknown");
  const metrics = emptyMetrics();
  metrics.comment_count = item.metrics?.comment_count || 0;
  metrics.reply_count = metrics.comment_count;
  metrics.like_count = item.metrics?.like_count || 0;
  return {
    provider: "instagram",
    publication_id: `shortcode:${item.shortcode}`,
    shortcode: item.shortcode,
    is_placeholder: true,
    visible_order: visibleOrder,
    visible_url: item.url,
    text: item.text || "",
    created_at: "",
    type: mediaType,
    raw_type: "visible-dom",
    author: {
      provider: "instagram",
      provider_user_id: "",
      username: item.author?.username || "",
      name: item.author?.name || item.author?.username || "",
      avatar_url: item.author?.avatar_url || "",
    },
    metrics,
    hashtags: [],
    user_mentions: [],
    media_count: 0,
    urls: [],
    source: "Instagram DOM",
    url: item.url,
  };
}

function migratePublicationRelations(
  store: BackgroundStore,
  fromPublicationId: string,
  toPublicationId: string,
) {
  if (fromPublicationId === toPublicationId) return;
  const fromKey = publicationKey("instagram", fromPublicationId);
  const toKey = publicationKey("instagram", toPublicationId);

  if (store.commentsByPublication[fromKey]?.length) {
    const existing = store.commentsByPublication[toKey] || [];
    const existingIds = new Set(existing.map((comment) => comment.comment_id));
    const migrated = store.commentsByPublication[fromKey].map((comment) => ({
      ...comment,
      publication_id: toPublicationId,
    }));
    store.commentsByPublication[toKey] = [
      ...existing,
      ...migrated.filter((comment) => !existingIds.has(comment.comment_id)),
    ];
    delete store.commentsByPublication[fromKey];
  }

  if (store.engagementsByPublication[fromKey]?.length) {
    const existing = store.engagementsByPublication[toKey] || [];
    const existingIds = new Set(existing.map((engagement) => engagement.engagement_id));
    const migrated = store.engagementsByPublication[fromKey].map((engagement) => ({
      ...engagement,
      publication_id: toPublicationId,
      engagement_id: engagement.engagement_id.replace(fromPublicationId, toPublicationId),
    }));
    store.engagementsByPublication[toKey] = [
      ...existing,
      ...migrated.filter((engagement) => !existingIds.has(engagement.engagement_id)),
    ];
    delete store.engagementsByPublication[fromKey];
  }
}

function storePublication(store: BackgroundStore, publication: SocialPublication) {
  let publicationToStore = publication;
  let key = publicationKey(publication.provider, publication.publication_id);
  let existing = store.publications[key];

  if (publication.provider === "instagram" && publication.shortcode) {
    const previousPublicationId = store.instagramPublicationIdsByShortcode[publication.shortcode];
    if (previousPublicationId && previousPublicationId !== publication.publication_id) {
      const previousKey = publicationKey("instagram", previousPublicationId);
      const previous = store.publications[previousKey];
      existing = previous && existing ? { ...previous, ...existing } : previous || existing;
      delete store.publications[previousKey];
      migratePublicationRelations(store, previousPublicationId, publication.publication_id);
    }
    store.instagramPublicationIdsByShortcode[publication.shortcode] = publication.publication_id;
    key = publicationKey(publication.provider, publication.publication_id);
    publicationToStore = {
      ...publication,
      visible_order: publication.visible_order ?? existing?.visible_order,
      visible_url: publication.visible_url || existing?.visible_url,
      capture_order: existing?.capture_order || publication.capture_order,
      captured_at: existing?.captured_at || publication.captured_at,
      is_placeholder: Boolean(publication.is_placeholder),
    };
  }

  store.publications[key] = {
    ...existing,
    ...publicationToStore,
    captured_at:
      existing?.captured_at || publicationToStore.captured_at || new Date().toISOString(),
    capture_order:
      existing?.capture_order || publicationToStore.capture_order || store.nextCaptureOrder++,
    capture_priority: Math.min(
      existing?.capture_priority ?? Number.MAX_SAFE_INTEGER,
      publicationToStore.capture_priority ?? 100,
    ),
  };
}

function sortPublications(publications: SocialPublication[]) {
  return publications.sort((a, b) => {
    const orderA = a.capture_order || Number.MAX_SAFE_INTEGER;
    const orderB = b.capture_order || Number.MAX_SAFE_INTEGER;
    const visibleA = a.visible_order ?? Number.MAX_SAFE_INTEGER;
    const visibleB = b.visible_order ?? Number.MAX_SAFE_INTEGER;
    if (visibleA !== visibleB) return visibleA - visibleB;
    const priorityA = a.capture_priority ?? 100;
    const priorityB = b.capture_priority ?? 100;
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function storeComment(store: BackgroundStore, comment: SocialComment) {
  const key = publicationKey(comment.provider, comment.publication_id);
  const existing = store.commentsByPublication[key] || [];
  const existingIndex = existing.findIndex((item) => item.comment_id === comment.comment_id);
  if (existingIndex === -1) {
    store.commentsByPublication[key] = [
      ...existing,
      { ...comment, captured_at: comment.captured_at || new Date().toISOString() },
    ];
    return;
  }

  store.commentsByPublication[key] = existing.map((item, index) =>
    index === existingIndex
      ? {
          ...item,
          ...comment,
          captured_at: item.captured_at || comment.captured_at || new Date().toISOString(),
        }
      : item,
  );
}

function storeEngagement(store: BackgroundStore, engagement: SocialEngagement) {
  const key = publicationKey(engagement.provider, engagement.publication_id);
  const existing = store.engagementsByPublication[key] || [];
  if (!existing.some((item) => item.engagement_id === engagement.engagement_id)) {
    store.engagementsByPublication[key] = [...existing, engagement];
  }
}

function recordRawPayload(
  store: BackgroundStore,
  provider: SocialProvider,
  endpoint: string,
  payload: unknown,
  timestamp: string,
) {
  const ep = getEndpointStore(store, provider, endpoint);
  ep.payloads.push(payload);
  ep.count++;
  ep.lastSeen = timestamp;
  store.lastUpdated = timestamp;
}

function resolveInstagramPublicationId(store: BackgroundStore, publicationId: string) {
  if (store.instagramPublicationIdsByShortcode[publicationId]) {
    return store.instagramPublicationIdsByShortcode[publicationId];
  }
  if (publicationId && !/^\d+$/.test(publicationId)) {
    const placeholderId = `shortcode:${publicationId}`;
    store.instagramPublicationIdsByShortcode[publicationId] = placeholderId;
    return placeholderId;
  }
  return publicationId;
}

function visibleInstagramItemsForHandle(
  store: BackgroundStore,
  items: BackgroundStore["instagramVisiblePublications"],
) {
  const handle = store.trackedHandle.trim().toLowerCase();
  if (!handle) return items;
  return items.filter((item) => (item.author?.username || "").toLowerCase() === handle);
}

function instagramPublicationAllowedForComments(store: BackgroundStore, shortcode: string) {
  const handle = store.trackedHandle.trim().toLowerCase();
  if (!handle) return true;
  const publicationId = store.instagramPublicationIdsByShortcode[shortcode];
  const publication =
    store.publications[publicationKey("instagram", shortcode)] ||
    (publicationId && store.publications[publicationKey("instagram", publicationId)]);
  if (publication) return publication.author.username.toLowerCase() === handle;
  return store.instagramVisiblePublications.some(
    (item) =>
      item.shortcode === shortcode && (item.author?.username || "").toLowerCase() === handle,
  );
}

function processXCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  const handle = store.trackedHandle.toLowerCase();

  if (request.endpoint === "UserTweets") {
    processUserTweetsPayload(
      request.payload,
      store.trackedHandle,
      (tweet, publication, rawResult) => {
        const authorHandle = tweet.author.screen_name.toLowerCase();

        if (authorHandle === handle) {
          if (!store.accountInfo && tweet.author.rest_id) {
            const authorResult = rawResult.core?.user_results?.result;
            store.accountInfo = accountInfoFromUser(authorResult || {}, tweet);
            store.trackedProfiles.x = accountInfoToTrackedProfile(store.accountInfo);
          }
          store.tweets[tweet.tweet_id] = tweet;
          storePublication(store, publication);
        }

        if (tweet.in_reply_to_screen_name?.toLowerCase() === handle && authorHandle !== handle) {
          store.communityReplies[tweet.tweet_id] = publication;
          storePublication(store, publication);
          storeEngagement(store, {
            provider: "x",
            publication_id: tweet.in_reply_to_tweet_id || tweet.tweet_id,
            kind: "comment",
            engagement_id: publicationKey(
              "x",
              `${tweet.in_reply_to_tweet_id || tweet.tweet_id}:reply:${tweet.tweet_id}`,
            ),
            actor: publication.author,
            engaged_at: tweet.created_at,
          });
        }
      },
    );
  }

  if (request.endpoint === "Favoriters") {
    const users = processFavoritersPayload(request.payload);
    const tweetIdMatch = (request.pageUrl || "").match(/status\/(\d+)/);
    if (tweetIdMatch && users.length) {
      const tweetId = tweetIdMatch[1] || "";
      if (!store.favoriters[tweetId]) store.favoriters[tweetId] = [];
      const existing = new Set(store.favoriters[tweetId].map((u) => u.rest_id));
      const freshUsers = users.filter((u) => !existing.has(u.rest_id));
      store.favoriters[tweetId].push(...freshUsers);
      for (const user of freshUsers) {
        storeEngagement(store, favoriterToEngagement(tweetId, user));
      }
    }
  }

  if (request.endpoint === "UserByScreenName") {
    const user = (request.payload as AnyRecord)?.data?.user?.result;
    if (
      user &&
      store.trackedHandle &&
      user.core?.screen_name?.toLowerCase() === store.trackedHandle.toLowerCase()
    ) {
      store.accountInfo = accountInfoFromUser(user);
      store.trackedProfiles.x = accountInfoToTrackedProfile(store.accountInfo);
    }
  }
}

function processInstagramCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  const handle = store.trackedHandle.toLowerCase();
  const publications = extractInstagramPublications(request.payload);
  const pageShortcode = instagramShortcodeFromUrl(request.pageUrl);

  for (const publication of publications) {
    if (publication.shortcode && publication.shortcode === pageShortcode) {
      publication.capture_priority = 0;
    }
    if (!handle || publication.author.username.toLowerCase() === handle) {
      storePublication(store, publication);
      if (publication.author.username.toLowerCase() === handle) {
        store.trackedProfiles.instagram = profileFromPublication(publication);
      }
    }
  }

  for (const comment of extractInstagramComments(request.payload, request.pageUrl)) {
    comment.publication_id = resolveInstagramPublicationId(store, comment.publication_id);
    if (!instagramPublicationAllowedForComments(store, comment.publication_id)) continue;
    storeComment(store, comment);
    storeEngagement(store, {
      provider: "instagram",
      publication_id: comment.publication_id,
      kind: "comment",
      engagement_id: publicationKey(
        "instagram",
        `${comment.publication_id}:comment:${comment.comment_id}`,
      ),
      actor: comment.author,
      engaged_at: comment.created_at,
    });
  }

  if (request.endpoint.includes("Liker") || request.endpoint.includes("LikedBy")) {
    for (const engagement of extractInstagramLikers(request.payload, request.pageUrl)) {
      engagement.publication_id = resolveInstagramPublicationId(store, engagement.publication_id);
      engagement.engagement_id = publicationKey(
        "instagram",
        `${engagement.publication_id}:like:${engagement.actor.provider_user_id || engagement.actor.username}`,
      );
      storeEngagement(store, engagement);
    }
  }
}

function clearCapturedData(store: BackgroundStore) {
  const trackedHandle = store.trackedHandle;
  Object.assign(store, createStore(trackedHandle));
  store.lastUpdated = new Date().toISOString();
}

function clearDisplayedData(store: BackgroundStore) {
  const trackedHandle = store.trackedHandle;
  const activeProvider = store.activeProvider;
  const pageSessionKeys = store.pageSessionKeys;
  const providerPageUrls = store.providerPageUrls;
  const archivedEndpoints = { ...store.archivedEndpoints, ...store.endpoints };
  Object.assign(store, createStore(trackedHandle));
  store.activeProvider = activeProvider;
  store.pageSessionKeys = pageSessionKeys;
  store.providerPageUrls = providerPageUrls;
  store.archivedEndpoints = archivedEndpoints;
  store.lastUpdated = new Date().toISOString();
}

function clearNormalizedData(store: BackgroundStore) {
  store.publications = {};
  store.commentsByPublication = {};
  store.engagementsByPublication = {};
  store.instagramPublicationIdsByShortcode = {};
  store.instagramVisiblePublications = [];
  store.instagramVisibleComments = [];
  store.communityReplies = {};
  store.tweets = {};
  store.favoriters = {};
  store.accountInfo = null;
  store.trackedProfiles = {};
  store.nextCaptureOrder = 1;
}

function hasCapturedData(store: BackgroundStore) {
  return (
    Object.keys(store.endpoints).length > 0 ||
    Object.keys(store.publications).length > 0 ||
    Object.keys(store.commentsByPublication).length > 0 ||
    Object.keys(store.engagementsByPublication).length > 0 ||
    store.instagramVisiblePublications.length > 0 ||
    store.instagramVisibleComments.length > 0 ||
    Object.keys(store.tweets).length > 0 ||
    Object.keys(store.communityReplies).length > 0 ||
    Object.keys(store.favoriters).length > 0
  );
}

function hasCapturedDataOutsideProvider(store: BackgroundStore, provider: SocialProvider) {
  return (
    Object.values(store.endpoints).some((endpoint) => endpoint.provider !== provider) ||
    Object.values(store.publications).some((publication) => publication.provider !== provider) ||
    Object.values(store.commentsByPublication)
      .flat()
      .some((comment) => comment.provider !== provider) ||
    Object.values(store.engagementsByPublication)
      .flat()
      .some((engagement) => engagement.provider !== provider)
  );
}

function activateContext(
  store: BackgroundStore,
  provider: null | SocialProvider,
  pageUrl?: string,
) {
  const previousUrl = provider ? store.providerPageUrls[provider] : "";
  const switchingProvider = Boolean(
    provider && store.activeProvider && store.activeProvider !== provider,
  );
  const switchingUrl = Boolean(provider && pageUrl && previousUrl && previousUrl !== pageUrl);
  const staleHydratedContext = Boolean(
    provider && !store.activeProvider && hasCapturedDataOutsideProvider(store, provider),
  );

  if (
    (switchingProvider || switchingUrl || staleHydratedContext || !provider) &&
    hasCapturedData(store)
  ) {
    clearCapturedData(store);
  }

  store.activeProvider = provider;
  if (provider && pageUrl) {
    store.providerPageUrls[provider] = pageUrl;
  }
  store.lastUpdated = new Date().toISOString();
}

function processVisibleInstagramComments(
  store: BackgroundStore,
  request: VisibleCommentsMessage,
  options: { recordRaw?: boolean } = { recordRaw: true },
) {
  if (!request.publication_shortcode) {
    return;
  }

  if (options.recordRaw !== false) {
    recordRawPayload(
      store,
      "instagram",
      "InstagramDomComments",
      {
        page_url: request.pageUrl,
        publication_shortcode: request.publication_shortcode,
        captured_at: request.captured_at,
        comments: request.comments,
      },
      request.captured_at,
    );
  }

  const publicationId = resolveInstagramPublicationId(store, request.publication_shortcode);
  const shouldStoreNormalized = instagramPublicationAllowedForComments(
    store,
    request.publication_shortcode,
  );
  const seen = new Set(
    store.instagramVisibleComments.map(
      (comment) => `${comment.publication_shortcode}:${comment.comment_id}`,
    ),
  );

  for (const visibleComment of request.comments) {
    const visibleKey = `${visibleComment.publication_shortcode}:${visibleComment.comment_id}`;
    if (!seen.has(visibleKey)) {
      seen.add(visibleKey);
      store.instagramVisibleComments.push({
        author: {
          provider: "instagram",
          provider_user_id: visibleComment.author.provider_user_id || "",
          username: visibleComment.author.username,
          name: visibleComment.author.name || visibleComment.author.username,
          avatar_url: visibleComment.author.avatar_url || "",
        },
        captured_at: request.captured_at,
        comment_id: visibleComment.comment_id,
        like_count: visibleComment.like_count || 0,
        parent_comment_id: visibleComment.parent_comment_id || null,
        publication_shortcode: visibleComment.publication_shortcode,
        relative_created_at: visibleComment.relative_created_at,
        source: visibleComment.source || "Instagram DOM",
        text: visibleComment.text,
      });
    }

    if (!shouldStoreNormalized) continue;

    const comment: SocialComment = {
      provider: "instagram",
      publication_id: publicationId,
      captured_at: request.captured_at,
      comment_id: visibleComment.comment_id,
      author: {
        provider: "instagram",
        provider_user_id: visibleComment.author.provider_user_id || "",
        username: visibleComment.author.username,
        name: visibleComment.author.name || visibleComment.author.username,
        avatar_url: visibleComment.author.avatar_url || "",
      },
      text: visibleComment.text,
      created_at: "",
      relative_created_at: visibleComment.relative_created_at,
      like_count: visibleComment.like_count || 0,
      parent_comment_id: visibleComment.parent_comment_id || null,
      source: visibleComment.source || "Instagram DOM",
    };

    storeComment(store, comment);
    storeEngagement(store, {
      provider: "instagram",
      publication_id: comment.publication_id,
      kind: "comment",
      engagement_id: publicationKey(
        "instagram",
        `${comment.publication_id}:comment:${comment.comment_id}`,
      ),
      actor: comment.author,
      captured_at: request.captured_at,
      engaged_at: null,
    });
  }

  store.lastUpdated = request.captured_at;
}

function instagramShortcodeFromUrl(pageUrl?: string) {
  if (!pageUrl) return "";
  return pageUrl.match(/\/(?:p|reel|reels)\/([^/?#]+)/)?.[1] || "";
}

function reprocessPayloads(store: BackgroundStore) {
  const visiblePublications = [...store.instagramVisiblePublications];
  const visibleComments = [...store.instagramVisibleComments];
  const providerPageUrls = { ...store.providerPageUrls };
  const pageSessionKeys = { ...store.pageSessionKeys };
  const archivedEndpoints = { ...store.archivedEndpoints };
  const cachedEndpoints = { ...store.archivedEndpoints, ...store.endpoints };
  const payloads = Object.values(cachedEndpoints).flatMap((endpoint) =>
    endpoint.payloads.map((payload) => ({
      action: "CAPTURED_PAYLOAD" as const,
      provider: endpoint.provider,
      endpoint: endpoint.endpoint,
      pageUrl: providerPageUrls[endpoint.provider],
      payload,
      timestamp: endpoint.lastSeen || new Date().toISOString(),
    })),
  );

  clearNormalizedData(store);
  store.instagramVisiblePublications = visiblePublications;
  store.instagramVisibleComments = visibleComments;
  store.pageSessionKeys = pageSessionKeys;
  store.providerPageUrls = providerPageUrls;
  store.archivedEndpoints = archivedEndpoints;

  visibleInstagramItemsForHandle(store, visiblePublications).forEach((item, index) => {
    storePublication(store, instagramPlaceholderPublication(item, index + 1));
  });

  for (const payload of payloads) {
    if (payload.provider === "x") processXCapture(store, payload);
    if (payload.provider === "instagram") processInstagramCapture(store, payload);
  }

  const commentsByBatch = new Map<string, VisibleCommentsMessage["comments"]>();
  for (const comment of visibleComments) {
    const key = comment.publication_shortcode;
    const comments = commentsByBatch.get(key) || [];
    comments.push({
      author: {
        provider_user_id: comment.author.provider_user_id,
        username: comment.author.username,
        name: comment.author.name,
        avatar_url: comment.author.avatar_url,
      },
      comment_id: comment.comment_id,
      like_count: comment.like_count,
      parent_comment_id: comment.parent_comment_id,
      publication_shortcode: comment.publication_shortcode,
      relative_created_at: comment.relative_created_at,
      source: comment.source,
      text: comment.text,
    });
    commentsByBatch.set(key, comments);
  }
  for (const [shortcode, comments] of commentsByBatch) {
    processVisibleInstagramComments(
      store,
      {
        action: "VISIBLE_COMMENTS",
        provider: "instagram",
        pageUrl: `https://www.instagram.com/p/${shortcode}/`,
        publication_shortcode: shortcode,
        captured_at: new Date().toISOString(),
        comments,
      },
      { recordRaw: false },
    );
  }
}

function buildExportJSON(store: BackgroundStore): ExportJSON {
  const publications = sortPublications(Object.values(store.publications));
  const tweets = Object.values(store.tweets).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const replies = Object.values(store.communityReplies).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const allComments = Object.values(store.commentsByPublication).flat();
  const allEngagements = Object.values(store.engagementsByPublication).flat();
  const totalLikes = publications.reduce(
    (sum, publication) => sum + publication.metrics.like_count,
    0,
  );
  const totalViews = publications.reduce(
    (sum, publication) => sum + publication.metrics.view_count,
    0,
  );
  const uniqueEngagers = new Set(
    allEngagements.map(
      (engagement) => engagement.actor.provider_user_id || engagement.actor.username,
    ),
  );

  const providerSummary = { instagram: emptyProviderSummary(), x: emptyProviderSummary() };
  for (const provider of ["instagram", "x"] as const) {
    const providerPublications = publications.filter(
      (publication) => publication.provider === provider,
    );
    const providerComments = allComments.filter((comment) => comment.provider === provider);
    const providerEngagements = allEngagements.filter(
      (engagement) => engagement.provider === provider,
    );
    providerSummary[provider] = {
      total_publications: providerPublications.length,
      total_comments: providerComments.length,
      total_engagements: providerEngagements.length,
      total_likes: providerPublications.reduce(
        (sum, publication) => sum + publication.metrics.like_count,
        0,
      ),
      total_views: providerPublications.reduce(
        (sum, publication) => sum + publication.metrics.view_count,
        0,
      ),
      unique_engagers: new Set(
        providerEngagements.map(
          (engagement) => engagement.actor.provider_user_id || engagement.actor.username,
        ),
      ).size,
    };
  }

  const originalTweets = tweets.filter((t) => t.type === "original");
  const xTotalLikes = originalTweets.reduce((s, t) => s + t.metrics.favorite_count, 0);
  const xTotalViews = originalTweets.reduce((s, t) => s + t.metrics.view_count, 0);
  const xTotalReplies = originalTweets.reduce((s, t) => s + t.metrics.reply_count, 0);

  const topByLikes = [...publications].sort(
    (a, b) => b.metrics.like_count - a.metrics.like_count,
  )[0];
  const topByViews = [...publications].sort(
    (a, b) => b.metrics.view_count - a.metrics.view_count,
  )[0];

  return {
    schema_version: 2,
    tracked_profiles: {
      instagram: store.trackedProfiles.instagram || { username: store.trackedHandle },
      x: store.trackedProfiles.x || { username: store.trackedHandle },
    },
    tracked_account: store.accountInfo || { screen_name: store.trackedHandle },
    exported_at: new Date().toISOString(),
    publications,
    comments_by_publication: store.commentsByPublication,
    engagements_by_publication: store.engagementsByPublication,
    raw_payloads: store.endpoints,
    tweets,
    community_replies: replies,
    favoriters_by_tweet: store.favoriters,
    summary: {
      total_publications: publications.length,
      total_comments: allComments.length,
      total_engagements: allEngagements.length,
      total_likes: totalLikes,
      total_views: totalViews,
      unique_engagers: uniqueEngagers.size,
      providers: providerSummary,
      top_publication_by_likes: topByLikes
        ? publicationKey(topByLikes.provider, topByLikes.publication_id)
        : null,
      top_publication_by_views: topByViews
        ? publicationKey(topByViews.provider, topByViews.publication_id)
        : null,
      total_tweets: tweets.length,
      total_original: originalTweets.length,
      total_retweets: tweets.filter((t) => t.type === "retweet").length,
      total_quotes: tweets.filter((t) => t.type === "quote").length,
      total_replies_from_account: tweets.filter((t) => t.type === "reply").length,
      total_community_replies: replies.length,
      total_reply_engagement: xTotalReplies,
      avg_likes_per_original: originalTweets.length
        ? Math.round(xTotalLikes / originalTweets.length)
        : 0,
      avg_views_per_original: originalTweets.length
        ? Math.round(xTotalViews / originalTweets.length)
        : 0,
      top_tweet_by_likes:
        [...originalTweets].sort((a, b) => b.metrics.favorite_count - a.metrics.favorite_count)[0]
          ?.tweet_id || null,
      top_tweet_by_views:
        [...originalTweets].sort((a, b) => b.metrics.view_count - a.metrics.view_count)[0]
          ?.tweet_id || null,
    },
  };
}

function storeForProvider(store: BackgroundStore, provider: null | SocialProvider) {
  if (!provider) return store;
  const scoped = createStore(store.trackedHandle);
  scoped.activeProvider = store.activeProvider;
  scoped.lastUpdated = store.lastUpdated;
  scoped.nextCaptureOrder = store.nextCaptureOrder;
  scoped.pageSessionKey = store.pageSessionKey;
  scoped.pageSessionKeys = store.pageSessionKeys;
  scoped.providerPageUrls = store.providerPageUrls;
  scoped.publications = Object.fromEntries(
    Object.entries(store.publications).filter(
      ([, publication]) => publication.provider === provider,
    ),
  );
  scoped.endpoints = Object.fromEntries(
    Object.entries(store.endpoints).filter(([, endpoint]) => endpoint.provider === provider),
  );
  scoped.commentsByPublication = Object.fromEntries(
    Object.entries(store.commentsByPublication)
      .map(([key, comments]) => ({
        key,
        comments: comments.filter((comment) => comment.provider === provider),
      }))
      .filter(({ comments }) => comments.length)
      .map(({ key, comments }) => [key, comments]),
  );
  scoped.engagementsByPublication = Object.fromEntries(
    Object.entries(store.engagementsByPublication)
      .map(([key, engagements]) => ({
        key,
        engagements: engagements.filter((engagement) => engagement.provider === provider),
      }))
      .filter(({ engagements }) => engagements.length)
      .map(({ key, engagements }) => [key, engagements]),
  );
  scoped.trackedProfiles = store.trackedProfiles[provider]
    ? { [provider]: store.trackedProfiles[provider] }
    : {};

  if (provider === "instagram") {
    scoped.instagramPublicationIdsByShortcode = store.instagramPublicationIdsByShortcode;
    scoped.instagramVisiblePublications = store.instagramVisiblePublications;
    scoped.instagramVisibleComments = store.instagramVisibleComments;
  }

  if (provider === "x") {
    scoped.communityReplies = store.communityReplies;
    scoped.tweets = store.tweets;
    scoped.favoriters = store.favoriters;
    scoped.accountInfo = store.accountInfo;
  }

  return scoped;
}

function emptyProviderSummary() {
  return {
    total_publications: 0,
    total_comments: 0,
    total_engagements: 0,
    total_likes: 0,
    total_views: 0,
    unique_engagers: 0,
  };
}

function endpointSummary(store: BackgroundStore) {
  const summary: Record<
    string,
    { count: number; endpoint: string; lastSeen: null | string; provider: SocialProvider }
  > = {};
  for (const [name, ep] of Object.entries(store.endpoints)) {
    summary[name] = {
      provider: ep.provider,
      endpoint: ep.endpoint,
      count: ep.count,
      lastSeen: ep.lastSeen,
    };
  }
  return summary;
}

export function handleRuntimeMessage(
  store: BackgroundStore,
  request: RuntimeMessage,
  context: MessageContext = {},
): unknown {
  if (request.action === "SET_ACTIVE_PROVIDER") {
    const previousProvider = store.activeProvider;
    activateContext(store, request.provider, request.pageUrl);
    if (previousProvider !== request.provider) {
      context.log?.(`[Social Interceptor] provider ativo: ${request.provider || "nenhum"}`);
    }
    return { activeProvider: store.activeProvider, success: true };
  }

  if (request.action === "PAGE_SESSION_STARTED") {
    activateContext(store, request.provider, request.pageUrl);
    store.providerPageUrls[request.provider] = request.pageUrl;
    if (store.pageSessionKeys[request.provider] !== request.sessionKey) {
      clearCapturedData(store);
      store.activeProvider = request.provider;
      store.providerPageUrls[request.provider] = request.pageUrl;
      store.pageSessionKey = request.sessionKey;
      store.pageSessionKeys[request.provider] = request.sessionKey;
      store.lastUpdated = new Date().toISOString();
      context.log?.(`[Social Interceptor] nova sessão de página: ${request.pageUrl}`);
    }
    return { success: true };
  }

  if (request.action === "VISIBLE_PUBLICATIONS") {
    const items: BackgroundStore["instagramVisiblePublications"] = request.items?.length
      ? request.items
      : request.shortcodes.map((shortcode) => ({
          shortcode,
          url: `https://www.instagram.com/p/${shortcode}/`,
        }));

    const filteredItems = visibleInstagramItemsForHandle(store, items);
    store.instagramVisiblePublications = filteredItems;
    filteredItems.forEach((item, index) => {
      const publicationId =
        store.instagramPublicationIdsByShortcode[item.shortcode] || `shortcode:${item.shortcode}`;
      const key = publicationKey("instagram", publicationId);
      const publication = store.publications[key];
      if (publication) {
        publication.visible_order = index + 1;
        publication.visible_url = item.url;
        if (publication.is_placeholder) {
          publication.text = publication.text || item.text || "";
          publication.type =
            publication.type === "unknown" && item.mediaType ? item.mediaType : publication.type;
          publication.author = {
            ...publication.author,
            username: publication.author.username || item.author?.username || "",
            name: publication.author.name || item.author?.name || item.author?.username || "",
            avatar_url: publication.author.avatar_url || item.author?.avatar_url || "",
          };
          publication.metrics.comment_count ||= item.metrics?.comment_count || 0;
          publication.metrics.reply_count = publication.metrics.comment_count;
          publication.metrics.like_count ||= item.metrics?.like_count || 0;
        }
        if (!publication.url) publication.url = item.url;
        return;
      }
      storePublication(store, instagramPlaceholderPublication(item, index + 1));
    });
    store.lastUpdated = new Date().toISOString();
    return { success: true };
  }

  if (request.action === "VISIBLE_COMMENTS") {
    processVisibleInstagramComments(store, request);
    return { success: true };
  }
  const capture = normalizeCapture(request);
  if (capture) {
    if (capture.pageUrl) store.providerPageUrls[capture.provider] = capture.pageUrl;
    recordRawPayload(store, capture.provider, capture.endpoint, capture.payload, capture.timestamp);

    if (capture.provider === "x") processXCapture(store, capture);
    if (capture.provider === "instagram") processInstagramCapture(store, capture);

    context.log?.(
      `[Social Interceptor] ${capture.provider}:${capture.endpoint} (publicações: ${Object.keys(store.publications).length})`,
    );
    return { success: true };
  }

  if (request.action === "SET_HANDLE") {
    const provider = request.provider ?? store.activeProvider;
    if (provider || request.pageUrl) {
      activateContext(store, provider, request.pageUrl);
    }
    store.trackedHandle = request.handle;
    context.persistHandle?.(request.handle);
    reprocessPayloads(store);
    return {
      success: true,
      publicationCount: Object.keys(store.publications).length,
      tweetCount: Object.keys(store.tweets).length,
    };
  }

  if (request.action === "GET_HANDLE") {
    return { handle: store.trackedHandle };
  }

  if (request.action === "GET_PUBLICATIONS" || request.action === "GET_TWEETS") {
    const provider = request.provider ?? store.activeProvider;
    const publications = sortPublications(
      Object.values(store.publications).filter(
        (publication) => !provider || publication.provider === provider,
      ),
    );
    const comments = Object.values(store.commentsByPublication)
      .flat()
      .filter((comment) => !provider || comment.provider === provider);
    const engagements = Object.values(store.engagementsByPublication)
      .flat()
      .filter((engagement) => !provider || engagement.provider === provider);
    return {
      publications,
      commentsCount: comments.length,
      engagementsCount: engagements.length,
      tweets:
        provider && provider !== "x"
          ? []
          : Object.values(store.tweets).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            ),
      replyCount: provider && provider !== "x" ? 0 : Object.keys(store.communityReplies).length,
      accountInfo: provider && provider !== "x" ? null : store.accountInfo,
      trackedProfiles: store.trackedProfiles,
      lastUpdated: store.lastUpdated,
    };
  }

  if (request.action === "GET_EXPORT") {
    return buildExportJSON(storeForProvider(store, request.provider ?? store.activeProvider));
  }

  if (request.action === "GET_ENDPOINTS") {
    const provider = request.provider ?? store.activeProvider;
    const endpoints = endpointSummary(store);
    return {
      endpoints: Object.fromEntries(
        Object.entries(endpoints).filter(
          ([, endpoint]) => !provider || endpoint.provider === provider,
        ),
      ),
      lastUpdated: store.lastUpdated,
    };
  }

  if (request.action === "GET_ENDPOINT_PAYLOADS") {
    const ep =
      store.endpoints[request.endpoint] ||
      Object.values(store.endpoints).find((endpoint) => endpoint.endpoint === request.endpoint);
    return { payloads: ep ? ep.payloads : [] };
  }

  if (request.action === "GET_ALL_RAW") {
    const provider = request.provider ?? store.activeProvider;
    return {
      endpoints: Object.fromEntries(
        Object.entries(store.endpoints).filter(
          ([, endpoint]) => !provider || endpoint.provider === provider,
        ),
      ),
    };
  }

  if (request.action === "CLEAR_ALL") {
    clearDisplayedData(store);
    return { success: true };
  }

  return undefined;
}
