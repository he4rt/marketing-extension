import {
  emptyMetrics,
  recordRawPayload,
  storeComment,
  storeEngagement,
  storePublication,
  trackedHandleForProvider,
} from "../../background/store";
import type {
  BackgroundStore,
  ExportComment,
  ExportInstagramPost,
  ExportSummaryInstagram,
  ExportV3PlatformInstagram,
  InstagramStore,
  SocialActor,
  SocialComment,
  SocialEngagement,
  SocialPublication,
} from "../../shared/domain";
import type { CapturedPayloadMessage, VisibleCommentsMessage } from "../../shared/messages";
import type { BackgroundProviderFacet, ScopeMode } from "../contract";
import { publicationKey } from "../shared/utils";
import {
  extractInstagramComments,
  extractInstagramLikers,
  extractInstagramPublications,
  profileFromPublication,
} from "./parser";

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

function instagramShortcodeFromUrl(pageUrl?: string) {
  if (!pageUrl) return "";
  return pageUrl.match(/\/(?:p|reel|reels)\/([^/?#]+)/)?.[1] || "";
}

function resolveInstagramPublicationId(store: BackgroundStore, publicationId: string) {
  const istore = store.platforms.instagram;
  if (istore.publicationIdsByShortcode[publicationId]) {
    return istore.publicationIdsByShortcode[publicationId];
  }
  if (publicationId && !/^\d+$/.test(publicationId)) {
    const placeholderId = `shortcode:${publicationId}`;
    istore.publicationIdsByShortcode[publicationId] = placeholderId;
    return placeholderId;
  }
  return publicationId;
}

function instagramPublicationAllowedForComments(store: BackgroundStore, shortcode: string) {
  const istore = store.platforms.instagram;
  const handle = trackedHandleForProvider(store, "instagram").toLowerCase();
  if (!handle) return true;
  const publicationId = istore.publicationIdsByShortcode[shortcode];
  const key = publicationKey("instagram", shortcode);
  const pub =
    istore.publications[key] ||
    (publicationId && istore.publications[publicationKey("instagram", publicationId)]);
  if (pub) return pub.author.username.toLowerCase() === handle;
  return istore.visiblePublications.some(
    (item) =>
      item.shortcode === shortcode && (item.author?.username || "").toLowerCase() === handle,
  );
}

export function instagramPlaceholderPublication(
  item: InstagramStore["visiblePublications"][number],
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
  const istore = store.platforms.instagram;
  const fromKey = publicationKey("instagram", fromPublicationId);
  const toKey = publicationKey("instagram", toPublicationId);

  const migrateComments = (
    src: Record<string, SocialComment[]>,
    dst: Record<string, SocialComment[]>,
  ) => {
    if (src[fromKey]?.length) {
      const existing = dst[toKey] || [];
      const existingIds = new Set(existing.map((c) => c.comment_id));
      const migrated = src[fromKey].map((c) => ({ ...c, publication_id: toPublicationId }));
      dst[toKey] = [...existing, ...migrated.filter((c) => !existingIds.has(c.comment_id))];
      delete src[fromKey];
    }
  };

  const migrateEngagements = (
    src: Record<string, SocialEngagement[]>,
    dst: Record<string, SocialEngagement[]>,
  ) => {
    if (src[fromKey]?.length) {
      const existing = dst[toKey] || [];
      const existingIds = new Set(existing.map((e) => e.engagement_id));
      const migrated = src[fromKey].map((e) => ({
        ...e,
        publication_id: toPublicationId,
        engagement_id: e.engagement_id.replace(fromPublicationId, toPublicationId),
      }));
      dst[toKey] = [...existing, ...migrated.filter((e) => !existingIds.has(e.engagement_id))];
      delete src[fromKey];
    }
  };

  migrateComments(istore.commentsByPublication, istore.commentsByPublication);
  migrateEngagements(istore.engagementsByPublication, istore.engagementsByPublication);
}

export function processInstagramCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  const istore = store.platforms.instagram;
  const handle = trackedHandleForProvider(store, "instagram").toLowerCase();
  const publications = extractInstagramPublications(request.payload);
  const pageShortcode = instagramShortcodeFromUrl(request.pageUrl);

  for (const publication of publications) {
    if (publication.shortcode && publication.shortcode === pageShortcode) {
      publication.capture_priority = 0;
    }
    if (!handle || publication.author.username.toLowerCase() === handle) {
      const prevMapping = publication.shortcode
        ? istore.publicationIdsByShortcode[publication.shortcode]
        : undefined;
      storePublication(store, publication);
      if (publication.shortcode) {
        const prevId = prevMapping;
        const newId = publication.publication_id;
        if (prevId && prevId !== newId) {
          migratePublicationRelations(store, prevId, newId);
        }
        istore.publicationIdsByShortcode[publication.shortcode] = newId;
      }
      if (publication.author.username.toLowerCase() === handle) {
        store.trackedProfiles.instagram = profileFromPublication(publication);
      }
    }
  }

  for (const comment of extractInstagramComments(request.payload, request.pageUrl)) {
    const commentShortcode = comment.publication_id;
    comment.publication_id = resolveInstagramPublicationId(store, comment.publication_id);
    if (!instagramPublicationAllowedForComments(store, commentShortcode)) continue;
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
    if (pageShortcode && !instagramPublicationAllowedForComments(store, pageShortcode)) return;
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

export function visibleInstagramItemsForHandle(
  store: BackgroundStore,
  items: InstagramStore["visiblePublications"],
) {
  const handle = trackedHandleForProvider(store, "instagram").toLowerCase();
  if (!handle) return items;
  return items.filter((item) => (item.author?.username || "").toLowerCase() === handle);
}

export function processVisibleInstagramComments(
  store: BackgroundStore,
  request: VisibleCommentsMessage,
  options: { recordRaw?: boolean } = { recordRaw: true },
) {
  const istore = store.platforms.instagram;
  if (!request.publication_shortcode) return;

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
    istore.visibleComments.map((c) => `${c.publication_shortcode}:${c.comment_id}`),
  );

  for (const vc of request.comments) {
    const visibleKey = `${vc.publication_shortcode}:${vc.comment_id}`;
    if (!seen.has(visibleKey)) {
      seen.add(visibleKey);
      const entry = {
        author: {
          provider: "instagram" as const,
          provider_user_id: vc.author.provider_user_id || "",
          username: vc.author.username,
          name: vc.author.name || vc.author.username,
          avatar_url: vc.author.avatar_url || "",
        },
        captured_at: request.captured_at,
        comment_id: vc.comment_id,
        like_count: vc.like_count || 0,
        parent_comment_id: vc.parent_comment_id || null,
        publication_shortcode: vc.publication_shortcode,
        relative_created_at: vc.relative_created_at,
        source: vc.source || "Instagram DOM",
        text: vc.text,
      };
      istore.visibleComments.push(entry);
    }

    if (!shouldStoreNormalized) continue;
    const comment: SocialComment = {
      provider: "instagram",
      publication_id: publicationId,
      captured_at: request.captured_at,
      comment_id: vc.comment_id,
      author: {
        provider: "instagram",
        provider_user_id: vc.author.provider_user_id || "",
        username: vc.author.username,
        name: vc.author.name || vc.author.username,
        avatar_url: vc.author.avatar_url || "",
      },
      text: vc.text,
      created_at: "",
      relative_created_at: vc.relative_created_at,
      like_count: vc.like_count || 0,
      parent_comment_id: vc.parent_comment_id || null,
      source: vc.source || "Instagram DOM",
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

function buildCommentTree(comments: SocialComment[]): ExportComment[] {
  const byId = new Map<string, ExportComment>();
  const roots: ExportComment[] = [];

  for (const c of comments) {
    const node: ExportComment = {
      comment_id: c.comment_id,
      author: c.author,
      text: c.text,
      created_at: c.created_at,
      like_count: c.like_count || undefined,
      replies: [],
    };
    byId.set(c.comment_id, node);
  }

  for (const c of comments) {
    const node = byId.get(c.comment_id)!;
    if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
      byId.get(c.parent_comment_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function buildPlatformDataInstagram(store: BackgroundStore): ExportV3PlatformInstagram {
  const istore = store.platforms.instagram;
  const sortedPubs = sortPublications(Object.values(istore.publications));

  const likesByPublication = new Map<string, SocialActor[]>();
  for (const [key, engagements] of Object.entries(istore.engagementsByPublication)) {
    for (const e of engagements) {
      if (e.kind !== "like") continue;
      const list = likesByPublication.get(key) || [];
      list.push(e.actor);
      likesByPublication.set(key, list);
    }
  }

  const content: ExportInstagramPost[] = sortedPubs.map((pub) => {
    const pubKey = publicationKey("instagram", pub.publication_id);
    const flatComments = istore.commentsByPublication[pubKey] || [];
    return {
      ...pub,
      engagers: {
        likes: likesByPublication.get(pubKey) || [],
        comments: buildCommentTree(flatComments),
      },
    };
  });

  return { content };
}

export function computeSummaryInstagram(store: BackgroundStore): ExportSummaryInstagram {
  const istore = store.platforms.instagram;
  const pubs = Object.values(istore.publications);
  return {
    total_content: pubs.length,
    total_likes: pubs.reduce((s, p) => s + p.metrics.like_count, 0),
    total_comments: Object.values(istore.commentsByPublication).flat().length,
    total_views: pubs.reduce((s, p) => s + p.metrics.view_count, 0),
  };
}

// Modos de Scope declaráveis (#9). O filtro real continua dentro de
// processInstagramCapture / instagramPublicationAllowedForComments (compara
// author.username com o handle); aqui só tornamos o modo "profile" declarável —
// selects() casa pelo username do autor.
export const scopeModes: ScopeMode[] = [
  {
    id: "profile",
    label: "Profile",
    selects: (pub, value) => pub.author.username?.toLowerCase() === value.toLowerCase(),
  },
];

export const instagramProvider: BackgroundProviderFacet = {
  id: "instagram",
  processCapture: processInstagramCapture,
};
