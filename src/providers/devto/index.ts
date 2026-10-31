import type { DevToStore } from "../../shared/domain";
import type { BackgroundProviderFacet } from "../contract";
import { publicationKey } from "../shared/utils";
import { articleIdFromUrl, parseAnalytics, parseReactions } from "./parser";

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
