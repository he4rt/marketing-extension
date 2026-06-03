import { publicationKey } from "../providers/shared/utils";
import type {
  BackgroundStore,
  NormalizedStore,
  SocialComment,
  SocialEngagement,
  SocialMetrics,
  SocialProvider,
  SocialPublication,
} from "../shared/domain";

export function getEndpointStore(
  store: BackgroundStore,
  provider: SocialProvider,
  endpoint: string,
) {
  const key = `${provider}:${endpoint}`;
  if (!store.endpoints[key]) {
    store.endpoints[key] = { provider, endpoint, payloads: [], count: 0, lastSeen: null };
  }
  return store.endpoints[key];
}

export function recordRawPayload(
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

// Helpers de armazenamento compartilhados por todos os providers.
// Fonte única: store per-platform (store.platforms.*). O dual-write para os stores
// legados planos foi removido na fatia #8; estes helpers escrevem só no per-platform.

export function emptyMetrics(): SocialMetrics {
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

export function trackedHandleForProvider(store: BackgroundStore, provider: SocialProvider) {
  return (store.trackedHandles[provider] ?? store.trackedHandle).trim();
}

// Grava a Provenance do Scope (#9) de uma publicação: qual modo/valor de coleta a trouxe.
// Mapa interno (store.provenance), nunca exportado no v3 — ver ScopeProvenance em domain.ts.
export function recordProvenance(
  store: BackgroundStore,
  provider: SocialProvider,
  publicationId: string,
  mode: string,
  value: string,
) {
  const map = store.provenance[provider] ?? {};
  map[publicationKey(provider, publicationId)] = { mode, value };
  store.provenance[provider] = map;
}

export function storePublication(store: BackgroundStore, publication: SocialPublication) {
  const provider = publication.provider;
  const key = publicationKey(provider, publication.publication_id);
  // Fonte única: store per-platform (x/instagram/linkedin — todos NormalizedStore).
  const pstore = store.platforms[provider] as NormalizedStore;
  const existing = pstore.publications[key];

  const merged = {
    ...existing,
    ...publication,
    captured_at: existing?.captured_at || publication.captured_at || new Date().toISOString(),
    capture_order: existing?.capture_order || publication.capture_order || store.nextCaptureOrder++,
    capture_priority: Math.min(
      existing?.capture_priority ?? Number.MAX_SAFE_INTEGER,
      publication.capture_priority ?? 100,
    ),
  };

  pstore.publications[key] = merged;

  // Clean up placeholder when real publication arrives for same shortcode
  if (provider === "instagram" && publication.shortcode) {
    const istore = store.platforms.instagram;
    const placeholderKey = publicationKey("instagram", `shortcode:${publication.shortcode}`);
    if (placeholderKey !== key && istore.publications[placeholderKey]) {
      const placeholder = istore.publications[placeholderKey];
      if (!merged.visible_order && placeholder.visible_order) {
        merged.visible_order = placeholder.visible_order;
        istore.publications[key] = merged;
      }
      delete istore.publications[placeholderKey];

      if (istore.commentsByPublication[placeholderKey]) {
        istore.commentsByPublication[key] = [
          ...(istore.commentsByPublication[key] || []),
          ...istore.commentsByPublication[placeholderKey],
        ];
        delete istore.commentsByPublication[placeholderKey];
      }
    }
  }
}

export function storeComment(store: BackgroundStore, comment: SocialComment) {
  const provider = comment.provider;
  const key = publicationKey(provider, comment.publication_id);
  const entry = { ...comment, captured_at: comment.captured_at || new Date().toISOString() };

  // Fonte única: store per-platform (x/instagram/linkedin — todos NormalizedStore).
  const pstore = store.platforms[provider] as NormalizedStore;
  const existing = pstore.commentsByPublication[key] || [];
  const existingIndex = existing.findIndex((c) => c.comment_id === comment.comment_id);
  if (existingIndex === -1) {
    pstore.commentsByPublication[key] = [...existing, entry];
  } else {
    pstore.commentsByPublication[key] = existing.map((c, i) =>
      i === existingIndex ? { ...c, ...entry, captured_at: c.captured_at || entry.captured_at } : c,
    );
  }
}

export function storeEngagement(store: BackgroundStore, engagement: SocialEngagement) {
  const provider = engagement.provider;
  const key = publicationKey(provider, engagement.publication_id);
  // Fonte única: store per-platform (x/instagram/linkedin — todos NormalizedStore).
  const pstore = store.platforms[provider] as NormalizedStore;
  const existing = pstore.engagementsByPublication[key] || [];
  if (!existing.some((e) => e.engagement_id === engagement.engagement_id)) {
    pstore.engagementsByPublication[key] = [...existing, engagement];
  }
}
