import { storeComment, storeEngagement } from "../../../background/store";
import type { BackgroundStore } from "../../../shared/domain";
import type { CapturedPayloadMessage } from "../../../shared/messages";
import { publicationKey } from "../../shared/utils";
import { linkedinParseComments } from "../parser";
import { resolvePublicationId } from "../shared";

export function processCommentsCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  if (!request.url) return;
  const lstore = store.platforms.linkedin.extra;
  const result = linkedinParseComments(request.payload, request.url);
  if (!result) return;

  const parentUrn = result.parentUrn;
  if (!lstore.comments[parentUrn]) {
    lstore.comments[parentUrn] = { items: [], total: 0, lastStart: 0 };
  }
  const entry = lstore.comments[parentUrn];
  if (entry) {
    const existing = new Set(entry.items.map((c) => c.comment_id));
    const fresh = result.comments.filter((c) => !existing.has(c.comment_id));
    entry.items.push(...fresh);
  }

  for (const comment of result.comments) {
    const pid = resolvePublicationId(store, parentUrn);
    comment.publication_id = pid;
    storeComment(store, comment);
    storeEngagement(store, {
      provider: "linkedin",
      publication_id: pid,
      kind: "comment",
      engagement_id: publicationKey("linkedin", `${pid}:comment:${comment.comment_id}`),
      actor: comment.author,
      engaged_at: comment.created_at,
    });
  }
}
