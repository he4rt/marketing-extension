import { storeEngagement } from "../../../background/store";
import type { BackgroundStore } from "../../../shared/domain";
import type { CapturedPayloadMessage } from "../../../shared/messages";
import { publicationKey } from "../../shared/utils";
import { linkedinParseReactions } from "../parser";
import { resolvePublicationId } from "../shared";

export function processReactionsCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  if (!request.url) return;
  const lstore = store.platforms.linkedin.extra;
  const result = linkedinParseReactions(request.payload, request.url);
  if (!result) return;

  if (result.isCommentReaction) {
    const threadUrn = result.parentUrn;
    if (!lstore.commentReactions[threadUrn]) {
      lstore.commentReactions[threadUrn] = { users: [] };
    }
    const existing = new Set(
      lstore.commentReactions[threadUrn].users.map((u) => u.provider_user_id),
    );
    const fresh = result.users.filter((u) => !existing.has(u.provider_user_id));
    lstore.commentReactions[threadUrn].users.push(...fresh);
  } else {
    const parentUrn = result.parentUrn;
    if (!lstore.reactions[parentUrn]) {
      lstore.reactions[parentUrn] = { users: [], total: 0, lastStart: 0 };
    }
    const entry = lstore.reactions[parentUrn];
    if (entry) {
      const existing = new Set(entry.users.map((u) => u.provider_user_id));
      const fresh = result.users.filter((u) => !existing.has(u.provider_user_id));
      entry.users.push(...fresh);
    }

    for (const user of result.users) {
      const pid = resolvePublicationId(store, parentUrn);
      storeEngagement(store, {
        provider: "linkedin",
        publication_id: pid,
        kind: "like",
        engagement_id: publicationKey(
          "linkedin",
          `${pid}:like:${user.provider_user_id || user.username}`,
        ),
        actor: user,
      });
    }
  }
}
