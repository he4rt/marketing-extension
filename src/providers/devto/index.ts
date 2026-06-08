import type {
  BackgroundStore,
  DevToStore,
  ExportSummaryDevto,
  ExportV3PlatformDevto,
} from "../../shared/domain";
import type { BackgroundProviderFacet } from "../contract";
import { publicationKey } from "../shared/utils";
import { articleIdFromUrl, parseAnalytics, parseReactions } from "./parser";

export function buildPlatformDataDevto(store: BackgroundStore): ExportV3PlatformDevto {
  const devto = store.platforms.devto as DevToStore;
  const content = Object.values(devto.extra.analytics).map((a) => {
    const key = publicationKey("devto", a.article_id);
    return {
      article_id: a.article_id,
      analytics: a,
      engagers: { reactions: devto.engagementsByPublication[key] ?? [] },
    };
  });
  return { content };
}

export function computeSummaryDevto(store: BackgroundStore): ExportSummaryDevto {
  const devto = store.platforms.devto as DevToStore;
  const articles = Object.values(devto.extra.analytics);
  const uniqueEngagers = new Set<string>();
  for (const engagements of Object.values(devto.engagementsByPublication)) {
    for (const e of engagements) {
      uniqueEngagers.add(e.actor.provider_user_id || e.actor.username);
    }
  }
  return {
    total_articles: articles.length,
    total_page_views: articles.reduce((s, a) => s + a.totals.page_views.total, 0),
    total_reactions: articles.reduce((s, a) => s + a.totals.reactions.total, 0),
    total_engagers: uniqueEngagers.size,
  };
}

export const devtoProvider: BackgroundProviderFacet = {
  id: "devto",
  processCapture(store, capture) {
    if (capture.provider !== "devto") return;

    const articleId = capture.url ? articleIdFromUrl(capture.url) : null;
    if (!articleId) return;

    const devtoStore = store.platforms.devto as DevToStore;

    if (capture.endpoint === "analytics") {
      const analytics = parseAnalytics(articleId, capture.payload);
      if (analytics) {
        devtoStore.extra.analytics[articleId] = analytics;
      }
    } else if (capture.endpoint === "reactions") {
      const engagements = parseReactions(articleId, capture.payload, capture.timestamp);
      const key = publicationKey("devto", articleId);
      devtoStore.engagementsByPublication[key] = engagements;
    }
  },
  scopeModes: [],
};
