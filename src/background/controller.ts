import {
  buildPlatformDataInstagram,
  computeSummaryInstagram,
  instagramPlaceholderPublication,
  instagramProvider,
  processVisibleInstagramComments,
  visibleInstagramItemsForHandle,
} from "../providers/instagram";
import {
  buildPlatformDataLinkedin,
  computeSummaryLinkedin,
  linkedinProvider,
} from "../providers/linkedin";
import { publicationKey } from "../providers/shared/utils";
import {
  buildPlatformDataX,
  computeSummaryX,
  xProvider,
} from "../providers/x";
import type {
  BackgroundStore,
  EndpointStore,
  ExportComment,
  ExportInstagramPost,
  ExportJSON,
  ExportLinkedInPost,
  ExportSummaryInstagram,
  ExportSummaryLinkedin,
  ExportSummaryX,
  ExportV3Meta,
  ExportV3PlatformInstagram,
  ExportV3PlatformLinkedin,
  ExportV3PlatformX,
  Favoriter,
  InstagramStore,
  LinkedInEngagementMetrics,
  LinkedInEngagerStore,
  LinkedInPostData,
  LinkedInReactionUser,
  LinkedInRepostEntry,
  LinkedInRepostStore,
  LinkedInStore,
  NormalizedStore,
  SocialActor,
  SocialComment,
  SocialEngagement,
  SocialMetrics,
  SocialProvider,
  SocialPublication,
  TweetData,
  XStore,
} from "../shared/domain";
import type {
  CapturedPayloadMessage,
  RuntimeMessage,
  VisibleCommentsMessage,
} from "../shared/messages";
import type { BackgroundProviderFacet } from "../providers/contract";
import {
  recordRawPayload,
  storePublication,
} from "./store";

type AnyRecord = Record<string, any>;

export type MessageContext = {
  log?: (message: string) => void;
  persistHandle?: (handle: string) => void;
};

const ALL_PROVIDERS: SocialProvider[] = ["instagram", "linkedin", "x"];

function emptyXStore(): XStore {
  return {
    tweets: {},
    favoriters: {},
    accountInfo: null,
    communityReplies: {},
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
  };
}

function emptyInstagramStore(): InstagramStore {
  return {
    publicationIdsByShortcode: {},
    visiblePublications: [],
    visibleComments: [],
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
  };
}

function emptyLinkedInStore(): LinkedInStore {
  return {
    posts: {},
    reactions: {},
    reposts: {},
    comments: {},
    commentReactions: {},
    accountInfo: null,
    feedOrder: [],
  };
}

export function createStore(trackedHandle = ""): BackgroundStore {
  return {
    activeProvider: null,
    archivedEndpoints: {},
    trackedHandle,
    endpoints: {},
    platforms: {
      x: emptyXStore(),
      instagram: emptyInstagramStore(),
      linkedin: emptyLinkedInStore(),
    },
    lastUpdated: null,
    nextCaptureOrder: 1,
    pageSessionKey: "",
    pageSessionKeys: {},
    providerPageUrls: {},
    trackedHandles: {},
    trackedProfiles: {},

    // Legacy flat stores
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
    instagramPublicationIdsByShortcode: {},
    instagramVisiblePublications: [],
    instagramVisibleComments: [],
    communityReplies: {},
    tweets: {},
    favoriters: {},
    accountInfo: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// getEndpointStore → src/background/store.ts

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

// emptyMetrics → src/background/store.ts


// storePublication / storeComment / storeEngagement → src/background/store.ts

// ---------------------------------------------------------------------------
// Capture processing
// ---------------------------------------------------------------------------

// trackedHandleForProvider → src/background/store.ts

// processXCapture → src/providers/x/index.ts

// instagramShortcodeFromUrl / resolveInstagramPublicationId / instagramPublicationAllowedForComments → src/providers/instagram/index.ts

// instagramPlaceholderPublication / migratePublicationRelations / processInstagramCapture → src/providers/instagram/index.ts

// processLinkedInCapture / findLinkedInPublicationByUrn → src/providers/linkedin/index.ts

// Registry de processamento por provider — o dispatch deixa de ser if-cascade.
// Adicionar um provider passa a ser registrar sua faceta aqui (e, nas próximas fatias,
// movê-la para src/providers/<id>/).
const BACKGROUND_PROVIDERS: Record<SocialProvider, BackgroundProviderFacet> = {
  x: xProvider,
  instagram: instagramProvider,
  linkedin: linkedinProvider,
};

// ---------------------------------------------------------------------------
// Visible Instagram helpers
// ---------------------------------------------------------------------------

// visibleInstagramItemsForHandle / processVisibleInstagramComments → src/providers/instagram/index.ts

// recordRawPayload → src/background/store.ts

// ---------------------------------------------------------------------------
// Clear / reprocess
// ---------------------------------------------------------------------------

function clearDisplayedData(store: BackgroundStore) {
  const trackedHandle = store.trackedHandle;
  const trackedHandles = { ...store.trackedHandles };
  const activeProvider = store.activeProvider;
  const pageSessionKeys = store.pageSessionKeys;
  const providerPageUrls = store.providerPageUrls;
  const archivedEndpoints = { ...store.archivedEndpoints, ...store.endpoints };
  Object.assign(store, createStore(trackedHandle));
  store.trackedHandles = trackedHandles;
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

function activateContext(store: BackgroundStore, provider: null | SocialProvider, pageUrl?: string) {
  store.activeProvider = provider;
  if (provider && pageUrl) store.providerPageUrls[provider] = pageUrl;
  store.lastUpdated = new Date().toISOString();
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

function reprocessPayloads(store: BackgroundStore) {
  const visiblePublications = [...store.instagramVisiblePublications];
  const visibleComments = [...store.instagramVisibleComments];
  const providerPageUrls = { ...store.providerPageUrls };
  const pageSessionKeys = { ...store.pageSessionKeys };
  const trackedHandles = { ...store.trackedHandles };
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
  store.trackedHandles = trackedHandles;

  visibleInstagramItemsForHandle(store, visiblePublications).forEach((item, index) => {
    storePublication(store, instagramPlaceholderPublication(item, index + 1));
  });

  for (const p of payloads) {
    BACKGROUND_PROVIDERS[p.provider].processCapture(store, p);
  }

  const commentsByBatch = new Map<string, VisibleCommentsMessage["comments"]>();
  for (const c of visibleComments) {
    const key = c.publication_shortcode;
    const batch = commentsByBatch.get(key) || [];
    batch.push({
      author: { provider_user_id: c.author.provider_user_id, username: c.author.username, name: c.author.name, avatar_url: c.author.avatar_url },
      comment_id: c.comment_id, like_count: c.like_count,
      parent_comment_id: c.parent_comment_id, publication_shortcode: c.publication_shortcode,
      relative_created_at: c.relative_created_at, source: c.source, text: c.text,
    });
    commentsByBatch.set(key, batch);
  }
  for (const [shortcode, comments] of commentsByBatch) {
    processVisibleInstagramComments(store, {
      action: "VISIBLE_COMMENTS", provider: "instagram",
      pageUrl: `https://www.instagram.com/p/${shortcode}/`,
      publication_shortcode: shortcode, captured_at: new Date().toISOString(), comments,
    }, { recordRaw: false });
  }
}

// ---------------------------------------------------------------------------
// Export v3
// ---------------------------------------------------------------------------

// buildPlatformDataX → src/providers/x/index.ts

// buildCommentTree / buildPlatformDataInstagram → src/providers/instagram/index.ts

// buildLinkedInCommentWithReactions / computeLinkedInEngagementMetrics → src/providers/linkedin/index.ts

// buildPlatformDataLinkedin → src/providers/linkedin/index.ts

// computeSummaryX → src/providers/x/index.ts

// computeSummaryInstagram → src/providers/instagram/index.ts

// computeSummaryLinkedin → src/providers/linkedin/index.ts

function buildExportJSON(store: BackgroundStore): ExportJSON {
  const xEngs = Object.values(store.platforms.x.engagementsByPublication).flat();
  const igEngs = Object.values(store.platforms.instagram.engagementsByPublication).flat();
  const liEngagers = new Set<string>();
  for (const entry of Object.values(store.platforms.linkedin.reactions))
    for (const u of entry.users) liEngagers.add(u.provider_user_id || u.username);
  for (const entry of Object.values(store.platforms.linkedin.reposts))
    for (const u of entry.users) liEngagers.add(u.urn || u.activity_urn || "");
  for (const entry of Object.values(store.platforms.linkedin.comments))
    for (const c of entry.items) liEngagers.add(c.author.provider_user_id || c.author.username);

  const allEngagers = new Set([
    ...xEngs.map((e) => e.actor.provider_user_id || e.actor.username),
    ...igEngs.map((e) => e.actor.provider_user_id || e.actor.username),
    ...liEngagers,
  ]);

  return {
    schema_version: 3,
    meta: {
      exported_at: new Date().toISOString(),
      handles: { ...store.trackedHandles, _: store.trackedHandle } as ExportV3Meta["handles"],
      profiles: {
        instagram: store.trackedProfiles.instagram || { username: store.trackedHandle },
        linkedin: store.trackedProfiles.linkedin || { username: store.trackedHandle },
        x: store.trackedProfiles.x || { username: store.trackedHandle },
      },
    },
    per_platform: {
      x: buildPlatformDataX(store),
      instagram: buildPlatformDataInstagram(store),
      linkedin: buildPlatformDataLinkedin(store),
    },
    unified: {
      summary: {
        all: {
          total_content:
            Object.values(store.platforms.x.publications).length +
            Object.values(store.platforms.instagram.publications).length +
            Object.values(store.platforms.linkedin.posts).length,
          total_likes:
            Object.values(store.platforms.x.publications).reduce((s, p) => s + p.metrics.like_count, 0) +
            Object.values(store.platforms.instagram.publications).reduce((s, p) => s + p.metrics.like_count, 0) +
            Object.values(store.platforms.linkedin.posts).reduce((s, p) => s + p.metrics.like_count, 0),
          total_comments:
            Object.values(store.platforms.x.commentsByPublication).flat().length +
            Object.values(store.platforms.instagram.commentsByPublication).flat().length +
            Object.values(store.platforms.linkedin.posts).reduce((s, p) => s + p.metrics.comment_count, 0),
          unique_engagers: allEngagers.size,
        },
        by_platform: {
          x: computeSummaryX(store),
          instagram: computeSummaryInstagram(store),
          linkedin: computeSummaryLinkedin(store),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// storeForProvider (legacy compat)
// ---------------------------------------------------------------------------

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
    Object.entries(store.publications).filter(([, p]) => p.provider === provider),
  );
  scoped.endpoints = Object.fromEntries(
    Object.entries(store.endpoints).filter(([, e]) => e.provider === provider),
  );
  scoped.commentsByPublication = Object.fromEntries(
    Object.entries(store.commentsByPublication)
      .map(([k, comments]) => ({ key: k, comments: comments.filter((c) => c.provider === provider) }))
      .filter(({ comments }) => comments.length)
      .map(({ key, comments }) => [key, comments]),
  );
  scoped.engagementsByPublication = Object.fromEntries(
    Object.entries(store.engagementsByPublication)
      .map(([k, engagements]) => ({ key: k, engagements: engagements.filter((e) => e.provider === provider) }))
      .filter(({ engagements }) => engagements.length)
      .map(({ key, engagements }) => [key, engagements]),
  );
  scoped.trackedProfiles = store.trackedProfiles[provider]
    ? { [provider]: store.trackedProfiles[provider] } : {};

  scoped.platforms = { ...scoped.platforms, [provider]: store.platforms[provider] };

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

function endpointSummary(store: BackgroundStore) {
  const summary: Record<string, { count: number; endpoint: string; lastSeen: null | string; provider: SocialProvider }> = {};
  for (const [name, ep] of Object.entries(store.endpoints)) {
    summary[name] = { provider: ep.provider, endpoint: ep.endpoint, count: ep.count, lastSeen: ep.lastSeen };
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

export function handleRuntimeMessage(
  store: BackgroundStore,
  request: RuntimeMessage,
  context: MessageContext = {},
): unknown {
  // Provider context
  if (request.action === "SET_ACTIVE_PROVIDER") {
    const prev = store.activeProvider;
    activateContext(store, request.provider, request.pageUrl);
    if (prev !== request.provider) context.log?.(`[Social Interceptor] provider ativo: ${request.provider || "nenhum"}`);
    return { activeProvider: store.activeProvider, success: true };
  }

  if (request.action === "PAGE_SESSION_STARTED") {
    activateContext(store, request.provider, request.pageUrl);
    store.providerPageUrls[request.provider] = request.pageUrl;
    if (store.pageSessionKeys[request.provider] !== request.sessionKey) {
      store.activeProvider = request.provider;
      store.providerPageUrls[request.provider] = request.pageUrl;
      store.pageSessionKey = request.sessionKey;
      store.pageSessionKeys[request.provider] = request.sessionKey;
      store.lastUpdated = new Date().toISOString();
      context.log?.(`[Social Interceptor] nova sessão de página: ${request.pageUrl}`);
    }
    return { success: true };
  }

  // Instagram visible data
  if (request.action === "VISIBLE_PUBLICATIONS") {
    const items: InstagramStore["visiblePublications"] = request.items?.length
      ? request.items
      : request.shortcodes.map((s) => ({ shortcode: s, url: `https://www.instagram.com/p/${s}/` }));
    const istore = store.platforms.instagram;
    const filteredItems = visibleInstagramItemsForHandle(store, items);
    istore.visiblePublications = filteredItems;
    store.instagramVisiblePublications = filteredItems;
    filteredItems.forEach((item, index) => {
      const publicationId = istore.publicationIdsByShortcode[item.shortcode] || `shortcode:${item.shortcode}`;
      const key = publicationKey("instagram", publicationId);
      const pub = store.publications[key];
      if (pub) {
        pub.visible_order = index + 1;
        pub.visible_url = item.url;
        if (pub.is_placeholder) {
          pub.text = pub.text || item.text || "";
          pub.type = pub.type === "unknown" && item.mediaType ? item.mediaType : pub.type;
          pub.author = { ...pub.author, username: pub.author.username || item.author?.username || "", name: pub.author.name || item.author?.name || item.author?.username || "", avatar_url: pub.author.avatar_url || item.author?.avatar_url || "" };
          pub.metrics.comment_count ||= item.metrics?.comment_count || 0;
          pub.metrics.reply_count = pub.metrics.comment_count;
          pub.metrics.like_count ||= item.metrics?.like_count || 0;
        }
        if (!pub.url) pub.url = item.url;
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

  // Capture
  const capture = normalizeCapture(request);
  if (capture) {
    if (capture.pageUrl) store.providerPageUrls[capture.provider] = capture.pageUrl;
    recordRawPayload(store, capture.provider, capture.endpoint, capture.payload, capture.timestamp);
    BACKGROUND_PROVIDERS[capture.provider].processCapture(store, capture);
    context.log?.(`[Social Interceptor] ${capture.provider}:${capture.endpoint} (publicações: ${Object.keys(store.publications).length})`);
    return { success: true };
  }

  // Handle management (legacy single)
  if (request.action === "SET_HANDLE") {
    const provider = request.provider ?? store.activeProvider;
    if (provider || request.pageUrl) activateContext(store, provider, request.pageUrl);
    store.trackedHandle = request.handle;
    if (provider) store.trackedHandles[provider] = request.handle;
    context.persistHandle?.(request.handle);
    reprocessPayloads(store);
    return { success: true, publicationCount: Object.keys(store.publications).length, tweetCount: Object.keys(store.tweets).length };
  }

  if (request.action === "GET_HANDLE") {
    const provider = Object.hasOwn(request, "provider") ? request.provider : null;
    return { handle: provider ? store.trackedHandles[provider] || "" : store.trackedHandle };
  }

  // Publications (legacy)
  if (request.action === "GET_PUBLICATIONS" || request.action === "GET_TWEETS") {
    const provider = request.provider ?? store.activeProvider;
    const publications = sortPublications(
      Object.values(store.publications).filter((p) => !provider || p.provider === provider),
    );
    const comments = Object.values(store.commentsByPublication).flat().filter((c) => !provider || c.provider === provider);
    const engagements = Object.values(store.engagementsByPublication).flat().filter((e) => !provider || e.provider === provider);
    return {
      publications, commentsCount: comments.length, engagementsCount: engagements.length,
      tweets: provider && provider !== "x" ? [] : Object.values(store.tweets).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      replyCount: provider && provider !== "x" ? 0 : Object.keys(store.communityReplies).length,
      accountInfo: provider && provider !== "x" ? null : store.accountInfo,
      trackedProfiles: store.trackedProfiles, lastUpdated: store.lastUpdated,
    };
  }

  // Export (legacy v2 - kept for compatibility)
  if (request.action === "GET_EXPORT") {
    if (request.provider) {
      return buildExportJSON(storeForProvider(store, request.provider ?? store.activeProvider));
    }
    return buildExportJSON(store);
  }

  // Endpoints
  if (request.action === "GET_ENDPOINTS") {
    const provider = request.provider ?? store.activeProvider;
    return { endpoints: Object.fromEntries(Object.entries(endpointSummary(store)).filter(([, ep]) => !provider || ep.provider === provider)), lastUpdated: store.lastUpdated };
  }

  if (request.action === "GET_ENDPOINT_PAYLOADS") {
    const ep = store.endpoints[request.endpoint] || Object.values(store.endpoints).find((e) => e.endpoint === request.endpoint);
    return { payloads: ep ? ep.payloads : [] };
  }

  if (request.action === "GET_ALL_RAW") {
    const provider = request.provider ?? store.activeProvider;
    return { endpoints: Object.fromEntries(Object.entries(store.endpoints).filter(([, ep]) => !provider || ep.provider === provider)) };
  }

  // Clear
  if (request.action === "CLEAR_ALL") {
    clearDisplayedData(store);
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // NEW: Multi-platform popup messages
  // -----------------------------------------------------------------------

  if (request.action === "GET_HANDLES") {
    return { handles: store.trackedHandles };
  }

  if (request.action === "SET_HANDLES") {
    for (const [provider, handle] of Object.entries(request.handles)) {
      if (handle !== undefined) {
        store.trackedHandles[provider as SocialProvider] = handle;
      }
    }
    const firstHandle = Object.values(request.handles).find(Boolean) || "";
    if (firstHandle) store.trackedHandle = firstHandle;
    context.persistHandle?.(firstHandle);
    reprocessPayloads(store);
    return { success: true };
  }

  if (request.action === "GET_PLATFORM_DATA") {
    const provider = request.provider;
    if (provider === "x") {
      const xstore = store.platforms.x;
      return {
        type: "x" as const,
        publications: xstore.publications,
        commentsByPublication: xstore.commentsByPublication,
        engagementsByPublication: xstore.engagementsByPublication,
        tweets: xstore.tweets,
        favoriters: xstore.favoriters,
        communityReplies: xstore.communityReplies,
        accountInfo: xstore.accountInfo,
        lastUpdated: store.lastUpdated,
      };
    }
    if (provider === "instagram") {
      const istore = store.platforms.instagram;
      const normalized: NormalizedStore = {
        publications: istore.publications,
        commentsByPublication: istore.commentsByPublication,
        engagementsByPublication: istore.engagementsByPublication,
      };
      return {
        type: "instagram" as const,
        ...normalized,
        visibleCount: istore.visiblePublications.length,
        lastUpdated: store.lastUpdated,
      };
    }
    if (provider === "linkedin") {
      const lstore = store.platforms.linkedin;
      const enriched = (lstore.feedOrder || [])
        .map((id) => {
          const post = lstore.posts[id];
          if (!post) return null;
          const shareUrn = post.share_urn;
          const activityUrn = post.activity_urn;
          const reactions = lstore.reactions[shareUrn] || lstore.reactions[activityUrn];
          const reposts = lstore.reposts[shareUrn];
          const comments = lstore.comments[shareUrn] || lstore.comments[activityUrn];
          return {
            ...post,
            engagers: {
              reactions: { captured: reactions?.users?.length || 0, total: reactions?.total || 0 },
              reposts: { captured: reposts?.users?.length || 0, total: reposts?.total || 0 },
              comments: { captured: comments?.items?.length || 0, total: comments?.total || 0 },
            },
          };
        })
        .filter(Boolean);
      return { type: "linkedin" as const, content: enriched, lastUpdated: store.lastUpdated };
    }
    return { type: "unknown", publications: [], commentsByPublication: {}, engagementsByPublication: {} };
  }

  if (request.action === "GET_ALL_SUMMARY") {
    const byPlatform: Record<string, { content_count: number; engager_count: number }> = {};

    // X
    const xPubs = Object.values(store.platforms.x.publications);
    const xEngagers = new Set<string>();
    for (const favs of Object.values(store.platforms.x.favoriters)) {
      for (const f of favs) xEngagers.add(f.rest_id || f.screen_name);
    }
    byPlatform.x = { content_count: xPubs.length, engager_count: xEngagers.size };

    // Instagram
    const igPubs = Object.values(store.platforms.instagram.publications);
    const igEngs = Object.values(store.platforms.instagram.engagementsByPublication).flat();
    const igEngagers = new Set(igEngs.map((e) => e.actor.provider_user_id || e.actor.username));
    byPlatform.instagram = { content_count: igPubs.length, engager_count: igEngagers.size };

    // LinkedIn
    const liPubs = Object.values(store.platforms.linkedin.posts);
    const liEngagers = new Set<string>();
    for (const entry of Object.values(store.platforms.linkedin.reactions)) {
      for (const u of entry.users) liEngagers.add(u.provider_user_id || u.username);
    }
    for (const entry of Object.values(store.platforms.linkedin.reposts)) {
      for (const u of entry.users) liEngagers.add(u.urn || u.activity_urn || "");
    }
    for (const entry of Object.values(store.platforms.linkedin.comments)) {
      for (const c of entry.items) liEngagers.add(c.author.provider_user_id || c.author.username);
    }
    byPlatform.linkedin = { content_count: liPubs.length, engager_count: liEngagers.size };

    const total = xPubs.length + igPubs.length + liPubs.length;
    const allEngagers = new Set([...xEngagers, ...igEngagers, ...liEngagers]);
    return {
      total_content: total,
      total_engagers: allEngagers.size,
      by_platform: byPlatform,
      lastUpdated: store.lastUpdated,
    };
  }

  if (request.action === "GET_RAW_PAYLOADS") {
    const provider = request.provider;
    return {
      endpoints: Object.fromEntries(
        Object.entries(store.endpoints).filter(([, ep]) => !provider || ep.provider === provider),
      ),
    };
  }

  return undefined;
}
