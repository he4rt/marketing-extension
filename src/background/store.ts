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

// Helpers de armazenamento compartilhados por todos os providers.
// Escrita dual (store legado plano + per-platform) durante a migração strangler;
// os ramos legados saem na fatia de limpeza (#8).

export function emptyMetrics(): SocialMetrics {
  return {
    bookmark_count: 0, comment_count: 0, like_count: 0,
    quote_count: 0, reply_count: 0, repost_count: 0,
    retweet_count: 0, save_count: 0, view_count: 0,
  };
}

export function trackedHandleForProvider(store: BackgroundStore, provider: SocialProvider) {
  return (store.trackedHandles[provider] ?? store.trackedHandle).trim();
}

export function storePublication(store: BackgroundStore, publication: SocialPublication) {
  const provider = publication.provider;
  const key = publicationKey(provider, publication.publication_id);
  const existing = store.publications[key];

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

  // Legacy flat store
  store.publications[key] = merged;

  // Per-platform store
  if (provider === "x" || provider === "instagram") {
    const pstore = store.platforms[provider] as NormalizedStore;
    pstore.publications[key] = merged;
  }

  // Clean up placeholder when real publication arrives for same shortcode
  if (provider === "instagram" && publication.shortcode) {
    const placeholderKey = publicationKey("instagram", `shortcode:${publication.shortcode}`);
    if (placeholderKey !== key && store.publications[placeholderKey]) {
      const placeholder = store.publications[placeholderKey];
      if (!merged.visible_order && placeholder.visible_order) {
        merged.visible_order = placeholder.visible_order;
        store.publications[key] = merged;
        const pstore = store.platforms.instagram;
        pstore.publications[key] = merged;
      }
      delete store.publications[placeholderKey];
      const istore = store.platforms.instagram;
      delete istore.publications[placeholderKey];

      if (store.commentsByPublication[placeholderKey]) {
        store.commentsByPublication[key] = [
          ...(store.commentsByPublication[key] || []),
          ...store.commentsByPublication[placeholderKey],
        ];
        delete store.commentsByPublication[placeholderKey];
      }
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
  const existing = store.commentsByPublication[key] || [];
  const existingIndex = existing.findIndex((c) => c.comment_id === comment.comment_id);
  const entry = { ...comment, captured_at: comment.captured_at || new Date().toISOString() };

  if (existingIndex === -1) {
    store.commentsByPublication[key] = [...existing, entry];
  } else {
    store.commentsByPublication[key] = existing.map((c, i) =>
      i === existingIndex ? { ...c, ...entry, captured_at: c.captured_at || entry.captured_at } : c,
    );
  }

  // Per-platform store
  if (provider === "x" || provider === "instagram") {
    const pstore = store.platforms[provider] as NormalizedStore;
    const pexisting = pstore.commentsByPublication[key] || [];
    if (!pexisting.some((c) => c.comment_id === comment.comment_id)) {
      pstore.commentsByPublication[key] = [...pexisting, entry];
    }
  }
}

export function storeEngagement(store: BackgroundStore, engagement: SocialEngagement) {
  const provider = engagement.provider;
  const key = publicationKey(provider, engagement.publication_id);
  const existing = store.engagementsByPublication[key] || [];
  if (!existing.some((e) => e.engagement_id === engagement.engagement_id)) {
    store.engagementsByPublication[key] = [...existing, engagement];
  }

  // Per-platform store
  if (provider === "x" || provider === "instagram") {
    const pstore = store.platforms[provider] as NormalizedStore;
    const pexisting = pstore.engagementsByPublication[key] || [];
    if (!pexisting.some((e) => e.engagement_id === engagement.engagement_id)) {
      pstore.engagementsByPublication[key] = [...pexisting, engagement];
    }
  }
}
