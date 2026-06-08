import { storeEngagement } from "../../../background/store";
import type { BackgroundStore } from "../../../shared/domain";
import type { CapturedPayloadMessage } from "../../../shared/messages";
import { publicationKey } from "../../shared/utils";
import { linkedinParseReposts } from "../parser";
import { resolvePublicationId } from "../shared";

export function processRepostsCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  if (!request.url) return;
  const lstore = store.platforms.linkedin.extra;
  const result = linkedinParseReposts(request.payload, request.url);
  if (!result) return;

  const parentUrn = result.parentUrn;
  if (!lstore.reposts[parentUrn]) {
    lstore.reposts[parentUrn] = { users: [], total: 0, lastStart: 0 };
  }
  const entry = lstore.reposts[parentUrn];

  const existingUrns = new Set(entry.users.map((u) => u.urn).filter(Boolean));
  const existingActivityUrns = new Set(entry.users.map((u) => u.activity_urn).filter(Boolean));

  for (const user of result.users) {
    if (user.urn) {
      if (existingUrns.has(user.urn)) continue;
      existingUrns.add(user.urn);
      entry.users.push(user);

      const pid = resolvePublicationId(store, parentUrn);
      storeEngagement(store, {
        provider: "linkedin",
        publication_id: pid,
        kind: "like",
        engagement_id: publicationKey("linkedin", `${pid}:repost:${user.urn}`),
        actor: {
          provider: "linkedin",
          provider_user_id: user.urn,
          username: (user.name || "").toLowerCase().replace(/\s+/g, "_"),
          name: user.name || "",
          avatar_url: user.avatar_url || "",
        },
      });
    } else if (user.activity_urn) {
      if (existingActivityUrns.has(user.activity_urn)) continue;
      existingActivityUrns.add(user.activity_urn);

      const existingPost = Object.values(lstore.posts).find(
        (p) => p.activity_urn === user.activity_urn,
      );
      if (existingPost) {
        entry.users.push({ reshare_ref: existingPost.id, activity_urn: user.activity_urn });
      } else {
        entry.users.push(user);
      }
    }
  }
}
