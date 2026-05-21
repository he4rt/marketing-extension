import type {
  SocialActor,
  SocialComment,
  SocialEngagement,
  SocialPublication,
  SocialPublicationType,
  TrackedProfile,
} from "../../shared/domain";
import {
  type AnyRecord,
  compactText,
  emptyMetrics,
  findFirstRecord,
  publicationKey,
  toIsoFromUnix,
  walkObjects,
} from "../shared/utils";

const FEED_CONNECTION = "xdt_api__v1__feed__timeline__connection";
const COMMENTS_CONNECTION = "xdt_api__v1__media__media_id__comments__connection";

export function inferInstagramEndpointFromPayload(payload: unknown, fallback = "InstagramPayload") {
  const hasFeed = findFirstRecord(payload, (record) => !!record[FEED_CONNECTION]);
  if (hasFeed) return "InstagramFeedTimeline";

  const hasComments = findFirstRecord(payload, (record) => !!record[COMMENTS_CONNECTION]);
  if (hasComments) return "InstagramComments";

  const media = findInstagramMedia(payload);
  if (media) return "InstagramMedia";

  const likers = findInstagramLikers(payload);
  if (likers.length > 0) return "InstagramLikers";

  return fallback;
}

export function extractInstagramPublications(payload: unknown): SocialPublication[] {
  const publications = new Map<string, SocialPublication>();

  const feedRecord = findFirstRecord(payload, (record) => !!record[FEED_CONNECTION]);
  const feed = feedRecord?.[FEED_CONNECTION] as AnyRecord | undefined;
  for (const edge of feed?.edges || []) {
    const media = edge?.node?.media || edge?.node?.media_or_ad || edge?.node;
    const publication = mediaToPublication(media);
    if (publication) publications.set(publication.publication_id, publication);
  }

  for (const media of findInstagramMediaRecords(payload)) {
    const publication = mediaToPublication(media);
    if (publication) publications.set(publication.publication_id, publication);
  }

  return [...publications.values()];
}

export function extractInstagramComments(payload: unknown, pageUrl?: string): SocialComment[] {
  const publicationId = publicationIdFromPageUrl(pageUrl);
  const commentsRecord = findFirstRecord(payload, (record) => !!record[COMMENTS_CONNECTION]);
  const connection = commentsRecord?.[COMMENTS_CONNECTION] as AnyRecord | undefined;
  const comments: SocialComment[] = [];

  for (const edge of connection?.edges || []) {
    const node = edge?.node;
    const comment = commentToSocialComment(node, publicationId);
    if (comment) comments.push(comment);
  }

  return comments;
}

export function extractInstagramLikers(payload: unknown, pageUrl?: string): SocialEngagement[] {
  const publicationId = publicationIdFromPageUrl(pageUrl);
  if (!publicationId) return [];

  return findInstagramLikers(payload).map((actor) => ({
    provider: "instagram",
    publication_id: publicationId,
    kind: "like",
    engagement_id: publicationKey(
      "instagram",
      `${publicationId}:like:${actor.provider_user_id || actor.username}`,
    ),
    actor,
  }));
}

export function mediaToPublication(media: AnyRecord | null | undefined): SocialPublication | null {
  if (!media || typeof media !== "object") return null;
  const publicationId = compactText(media.pk || media.id);
  const shortcode = compactText(media.code);
  if (!publicationId || !shortcode) return null;

  const metrics = emptyMetrics();
  metrics.like_count = Number(media.like_count) || 0;
  metrics.comment_count = Number(media.comment_count) || 0;
  metrics.reply_count = metrics.comment_count;
  metrics.view_count = Number(media.view_count) || 0;

  const type = mediaType(media);
  const author = userToActor(media.user || media.owner);
  if (!author.username && media.user?.username) author.username = media.user.username;

  return {
    provider: "instagram",
    publication_id: publicationId,
    shortcode,
    text: compactText(media.caption?.text),
    created_at: toIsoFromUnix(media.taken_at),
    type,
    raw_type: compactText(media.product_type) || String(media.media_type || ""),
    author,
    metrics,
    hashtags: extractHashtags(media.caption?.text),
    user_mentions: extractMentions(media.caption?.text),
    media_count:
      Number(media.carousel_media_count) ||
      (media.carousel_media ? media.carousel_media.length : 1),
    urls: [],
    source: "Instagram Web",
    url: `https://www.instagram.com/${type === "reel" ? "reel" : "p"}/${shortcode}/`,
  };
}

export function profileFromPublication(publication: SocialPublication): TrackedProfile {
  return {
    provider: "instagram",
    username: publication.author.username,
    name: publication.author.name,
    provider_user_id: publication.author.provider_user_id,
    avatar_url: publication.author.avatar_url,
    followers_count: publication.author.followers_count || 0,
    following_count: 0,
    description: "",
    is_verified: publication.author.is_verified,
  };
}

function commentToSocialComment(
  comment: AnyRecord | null | undefined,
  fallbackPublicationId: string,
): SocialComment | null {
  if (!comment || typeof comment !== "object") return null;
  const commentId = compactText(comment.pk || comment.id);
  if (!commentId) return null;
  return {
    provider: "instagram",
    publication_id: compactText(comment.media_id) || fallbackPublicationId,
    comment_id: commentId,
    author: userToActor(comment.user),
    text: compactText(comment.text),
    created_at: toIsoFromUnix(comment.created_at),
    like_count: Number(comment.comment_like_count) || 0,
    parent_comment_id: comment.parent_comment_id || null,
  };
}

function userToActor(user: AnyRecord | null | undefined): SocialActor {
  return {
    provider: "instagram",
    provider_user_id: compactText(user?.pk || user?.id || user?.fbid_v2),
    username: compactText(user?.username),
    name: compactText(user?.full_name || user?.username),
    full_name: compactText(user?.full_name),
    avatar_url: compactText(user?.profile_pic_url || user?.hd_profile_pic_url_info?.url),
    is_private: Boolean(user?.is_private),
    is_verified: Boolean(user?.is_verified),
    following: Boolean(user?.friendship_status?.following),
  };
}

function findInstagramMedia(payload: unknown) {
  return findInstagramMediaRecords(payload)[0] || null;
}

function findInstagramMediaRecords(payload: unknown) {
  const records = new Map<string, AnyRecord>();
  walkObjects(payload, (record) => {
    const media = mediaCandidate(record);
    if (!media) return;
    const key = compactText(media.pk || media.id || media.code);
    if (key) records.set(key, media);
  });
  return [...records.values()];
}

function mediaCandidate(record: AnyRecord): AnyRecord | null {
  const nested =
    record.media || record.media_or_ad || record.shortcode_media || record.xdt_shortcode_media;
  if (nested && typeof nested === "object") {
    const nestedCandidate = mediaCandidate(nested as AnyRecord);
    if (nestedCandidate) return nestedCandidate;
  }

  if (!record.code || !(record.pk || record.id)) return null;
  if (
    record.user ||
    record.owner ||
    record.caption ||
    typeof record.like_count === "number" ||
    typeof record.comment_count === "number" ||
    typeof record.media_type === "number" ||
    record.product_type
  ) {
    return record;
  }

  return null;
}

function findInstagramLikers(payload: unknown): SocialActor[] {
  const actors = new Map<string, SocialActor>();
  const candidate = (record: AnyRecord) => {
    if (!record.username || !record.profile_pic_url) return false;
    if (record.code || record.caption || record.comment_count) return false;
    return true;
  };

  const add = (record: AnyRecord) => {
    const actor = userToActor(record);
    const key = actor.provider_user_id || actor.username;
    if (key) actors.set(key, actor);
  };

  findFirstRecord(payload, (record) => {
    if (candidate(record)) add(record);
    return false;
  });

  return [...actors.values()];
}

function mediaType(media: AnyRecord): SocialPublicationType {
  if (media.product_type === "clips" || media.product_type === "reels") return "reel";
  if (media.carousel_media || media.carousel_media_count) return "carousel";
  if (media.media_type === 2) return "video";
  if (media.media_type === 1) return "image";
  return "unknown";
}

function extractHashtags(text: unknown) {
  return (
    compactText(text)
      .match(/#[\p{L}\p{N}_]+/gu)
      ?.map((tag) => tag.slice(1)) || []
  );
}

function extractMentions(text: unknown) {
  return (
    compactText(text)
      .match(/@[\w.]+/g)
      ?.map((username) => ({
        username: username.slice(1),
        name: username.slice(1),
      })) || []
  );
}

function publicationIdFromPageUrl(pageUrl?: string) {
  if (!pageUrl) return "";
  const match = pageUrl.match(/\/(?:p|reel|reels)\/([^/?#]+)/);
  return match?.[1] || "";
}
