import {
  recordProvenance,
  storePublication,
  trackedHandleForProvider,
} from "../../../background/store";
import type { BackgroundStore } from "../../../shared/domain";
import type { CapturedPayloadMessage } from "../../../shared/messages";
import {
  linkedinFeedAccountInfo,
  linkedinFeedToPosts,
  linkedinFeedToPublications,
} from "../parser";

export function processFeedCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  const lstore = store.platforms.linkedin.extra;
  const handle = trackedHandleForProvider(store, "linkedin");

  const publications = linkedinFeedToPublications(request.payload, handle);
  for (const pub of publications) {
    if (handle) recordProvenance(store, "linkedin", pub.publication_id, "profile", handle);
    storePublication(store, pub);
  }

  const posts = linkedinFeedToPosts(request.payload, handle);
  for (const post of posts) {
    lstore.posts[post.id] = post;
    if (!lstore.feedOrder.includes(post.id)) lstore.feedOrder.push(post.id);
  }

  const accountInfo = linkedinFeedAccountInfo(request.payload, handle);
  if (accountInfo) {
    lstore.accountInfo = accountInfo;
    store.trackedProfiles.linkedin = accountInfo;
  }
}
