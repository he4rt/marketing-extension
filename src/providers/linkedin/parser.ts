import type {
  LinkedInPostData,
  LinkedInRepostEntry,
  SocialActor,
  SocialComment,
  SocialMetrics,
  SocialPublication,
  SocialPublicationType,
  TrackedProfile,
} from "../../shared/domain";

type AnyRecord = Record<string, unknown>;

function buildImageUrl(vectorImage: AnyRecord | null | undefined): string {
  if (!vectorImage?.rootUrl || !Array.isArray(vectorImage.artifacts)) return "";
  const rootUrl = String(vectorImage.rootUrl);
  const artifacts = vectorImage.artifacts as Array<{ fileIdentifyingUrlPathSegment: string }>;
  const preferred = ["image-high-res", "shrink_1280", "shrink_800", "shrink_480", "shrink_160"];
  for (const prefix of preferred) {
    const art = artifacts.find((a) => a.fileIdentifyingUrlPathSegment.startsWith(prefix));
    if (art) return rootUrl + art.fileIdentifyingUrlPathSegment;
  }
  return rootUrl + (artifacts[0]?.fileIdentifyingUrlPathSegment || "");
}

function buildActor(update: AnyRecord, byEntityUrn: Record<string, AnyRecord>): SocialActor {
  const actor = (update.actor as AnyRecord) || {};
  const name = String((actor.name as AnyRecord)?.text || "");
  const urn = String(actor.backendUrn || "");

  let avatarVectorImage: AnyRecord | null = null;
  let companyUrn = "";
  const imgDetail = ((actor.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]?.detailData as
    | AnyRecord
    | undefined;
  if (imgDetail) {
    const companyLogo = imgDetail.nonEntityCompanyLogo as AnyRecord | undefined;
    if (companyLogo) {
      companyUrn = String(companyLogo["*company"] || "");
      avatarVectorImage = companyLogo.vectorImage as AnyRecord | null;
    }
    if (!avatarVectorImage) {
      const profilePic =
        (imgDetail.nonEntityProfilePicture as AnyRecord) || (imgDetail.profilePicture as AnyRecord);
      avatarVectorImage = (profilePic?.vectorImage as AnyRecord) || null;
    }
  }

  let vanityName = "";
  if (companyUrn) {
    const company = byEntityUrn[companyUrn] as AnyRecord | undefined;
    if (company?.url) {
      vanityName = String(company.url).replace(/\/$/, "").split("/").pop() || "";
    }
  }

  return {
    provider: "linkedin",
    provider_user_id: urn,
    username: vanityName || name.toLowerCase().replace(/\s+/g, "_"),
    name,
    avatar_url: buildImageUrl(avatarVectorImage),
  };
}

function extractMetrics(update: AnyRecord, byEntityUrn: Record<string, AnyRecord>): SocialMetrics {
  const metrics: SocialMetrics = {
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

  const socialDetailRef = update["*socialDetail"] as string | undefined;
  if (!socialDetailRef) return metrics;

  const socialDetail = byEntityUrn[socialDetailRef] as AnyRecord | undefined;
  if (!socialDetail) return metrics;

  const countsRef = socialDetail["*totalSocialActivityCounts"] as string | undefined;
  if (!countsRef) return metrics;

  const counts = byEntityUrn[countsRef] as AnyRecord | undefined;
  if (!counts) return metrics;

  metrics.like_count = (counts.numLikes as number) || 0;
  metrics.comment_count = (counts.numComments as number) || 0;
  metrics.repost_count = (counts.numShares as number) || 0;

  return metrics;
}

function extractHashtags(
  commentary: AnyRecord | null | undefined,
  byEntityUrn: Record<string, AnyRecord>,
): string[] {
  if (!commentary) return [];
  const attrs = ((commentary.text as AnyRecord)?.attributesV2 as Array<AnyRecord>) || [];
  const tags: string[] = [];
  for (const attr of attrs) {
    const hashtagRef = (attr.detailData as AnyRecord)?.["*hashtag"] as string | undefined;
    if (hashtagRef) {
      const entity = byEntityUrn[hashtagRef] as AnyRecord | undefined;
      if (entity?.trackingUrn) {
        const tag = String(entity.trackingUrn).replace(/^urn:li:hashtag:/, "");
        tags.push(tag);
      }
    }
  }
  return tags;
}

function extractMedia(content: AnyRecord | null | undefined): number {
  if (!content) return 0;
  const images = (content.images as unknown as Array<AnyRecord>) || [];
  return images.length;
}

export function linkedinFeedToPublications(
  payload: unknown,
  trackedHandle: string,
): SocialPublication[] {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  if (!data) return [];

  const feedKey = Object.keys(data).find((k) =>
    Array.isArray((data[k] as AnyRecord)?.["*elements"]),
  );
  if (!feedKey) return [];

  const feed = data[feedKey] as AnyRecord;
  const elements = (feed["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];
  if (!elements.length) return [];

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const handle = trackedHandle.toLowerCase();
  const publications: SocialPublication[] = [];

  for (const elementUrn of elements) {
    const update = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!update || (update.$type as string) !== "com.linkedin.voyager.dash.feed.Update") continue;

    const activityIdMatch = String(elementUrn).match(/urn:li:activity:(\d+)/);
    if (!activityIdMatch) continue;

    const actorInfo = buildActor(update, byEntityUrn);

    if (handle && !actorInfo.name.toLowerCase().includes(handle)) {
      const header = update.header as AnyRecord | undefined;
      const headerText = String((header?.text as AnyRecord)?.text || "");
      if (!headerText.toLowerCase().includes(handle)) continue;
    }

    const commentary = update.commentary as AnyRecord | null | undefined;
    const header = update.header as AnyRecord | undefined;
    const content = (update.content as AnyRecord) || {};

    const isRepost = Boolean(
      header?.text &&
        typeof header.text === "object" &&
        String((header.text as AnyRecord).text || "").includes("reposted"),
    );

    const commentaryText = (commentary?.text as AnyRecord)?.text;
    const text = String(commentaryText || "");
    const subDesc = String(((update.actor as AnyRecord)?.subDescription as AnyRecord)?.text || "");
    const metrics = extractMetrics(update, byEntityUrn);

    const type: SocialPublicationType = isRepost ? "repost" : "original";

    const metaUrn = String((update.metadata as AnyRecord)?.backendUrn || "");
    const shareUrn = String((update.metadata as AnyRecord)?.shareUrn || "");

    const hashtags = extractHashtags(commentary, byEntityUrn);
    const mediaCount = extractMedia(content.imageComponent as AnyRecord);

    const publication: SocialPublication = {
      provider: "linkedin",
      publication_id: metaUrn || `urn:li:activity:${activityIdMatch[1]}`,
      text,
      created_at: subDesc,
      type,
      raw_type: isRepost ? "repost" : "original",
      author: actorInfo,
      metrics,
      hashtags,
      user_mentions: [],
      media_count: mediaCount,
      urls: [],
      source: "company_feed",
      url: `https://www.linkedin.com/feed/update/${metaUrn || `urn:li:activity:${activityIdMatch[1]}`}`,
    };

    if (shareUrn) {
      publication.reposted_publication_id = shareUrn;
    }

    publications.push(publication);
  }

  return publications;
}

export function linkedinFeedAccountInfo(
  payload: unknown,
  trackedHandle: string,
): TrackedProfile | null {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  if (!data) return null;

  const feedKey = Object.keys(data).find((k) =>
    Array.isArray((data[k] as AnyRecord)?.["*elements"]),
  );
  if (!feedKey) return null;

  const feed = data[feedKey] as AnyRecord;
  const elements = (feed["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];
  if (!elements.length) return null;

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const handle = trackedHandle.toLowerCase();
  if (!handle) return null;

  for (const elementUrn of elements) {
    const update = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!update || (update.$type as string) !== "com.linkedin.voyager.dash.feed.Update") continue;

    const actor = (update.actor as AnyRecord) || {};
    const name = String((actor.name as AnyRecord)?.text || "");
    if (!name.toLowerCase().includes(handle)) continue;

    const actorInfo = buildActor(update, byEntityUrn);

    return {
      provider: "linkedin",
      provider_user_id: actorInfo.provider_user_id,
      username: actorInfo.username,
      name: actorInfo.name,
      avatar_url: actorInfo.avatar_url,
      description: String((actor.description as AnyRecord)?.text || ""),
      followers_count: 0,
      following_count: 0,
    };
  }

  return null;
}

export function linkedinParseReactions(
  payload: unknown,
  url: string,
): { parentUrn: string; users: SocialActor[]; isCommentReaction: boolean } | null {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  const reactionsData = data?.socialDashReactionsByReactionType as AnyRecord | undefined;
  if (!reactionsData) return null;

  let activityUrn = "";
  try {
    const u = new URL(url);
    const vars = u.searchParams.get("variables") || "";
    const commentMatch = vars.match(/threadUrn:([^,)]+)/);
    if (commentMatch?.[1]) {
      activityUrn = decodeURIComponent(commentMatch[1]);
      if (activityUrn.startsWith("urn:li:comment:")) {
        return linkedinParseCommentReactions(payload, activityUrn);
      }
    }
    const postMatch = vars.match(/urn:li:activity:(\d+)/) || vars.match(/urn:li:ugcPost:(\d+)/);
    if (postMatch) activityUrn = postMatch[0];
  } catch {
    return null;
  }
  if (!activityUrn) return null;

  const elements = (reactionsData["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const users: SocialActor[] = [];
  const seen = new Set<string>();

  for (const elementUrn of elements) {
    const reaction = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!reaction || (reaction.$type as string) !== "com.linkedin.voyager.dash.social.Reaction")
      continue;

    const lockup = reaction.reactorLockup as AnyRecord | undefined;
    if (!lockup) continue;

    const name = String((lockup.title as AnyRecord)?.text || "");

    let avatarUrl = "";
    const imgDetail = ((lockup.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]
      ?.detailData as AnyRecord | undefined;
    if (imgDetail) {
      const vec =
        (imgDetail.nonEntityProfilePicture as AnyRecord)?.vectorImage ||
        (imgDetail.vectorImage as AnyRecord);
      avatarUrl = buildImageUrl(vec as AnyRecord);
    }

    const memberMatch = String(reaction.preDashEntityUrn || "").match(/urn:li:member:(\d+)/);
    const urn = memberMatch ? `urn:li:member:${memberMatch[1]}` : String(reaction.actorUrn || "");
    if (!urn || seen.has(urn)) continue;
    seen.add(urn);

    users.push({
      provider: "linkedin",
      provider_user_id: urn,
      username: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      avatar_url: avatarUrl,
    });
  }

  return { parentUrn: activityUrn, users, isCommentReaction: false };
}

function linkedinParseCommentReactions(
  payload: unknown,
  threadUrn: string,
): { parentUrn: string; users: SocialActor[]; isCommentReaction: boolean } | null {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  const reactionsData = data?.socialDashReactionsByReactionType as AnyRecord | undefined;
  if (!reactionsData) return null;

  const elements = (reactionsData["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const users: SocialActor[] = [];
  const seen = new Set<string>();

  for (const elementUrn of elements) {
    const reaction = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!reaction || (reaction.$type as string) !== "com.linkedin.voyager.dash.social.Reaction")
      continue;

    const lockup = reaction.reactorLockup as AnyRecord | undefined;
    if (!lockup) continue;

    const name = String((lockup.title as AnyRecord)?.text || "");

    let avatarUrl = "";
    const imgDetail = ((lockup.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]
      ?.detailData as AnyRecord | undefined;
    if (imgDetail) {
      const vec =
        (imgDetail.nonEntityProfilePicture as AnyRecord)?.vectorImage ||
        (imgDetail.vectorImage as AnyRecord);
      avatarUrl = buildImageUrl(vec as AnyRecord);
    }

    const memberMatch = String(reaction.preDashEntityUrn || "").match(/urn:li:member:(\d+)/);
    const urn = memberMatch ? `urn:li:member:${memberMatch[1]}` : String(reaction.actorUrn || "");
    if (!urn || seen.has(urn)) continue;
    seen.add(urn);

    users.push({
      provider: "linkedin",
      provider_user_id: urn,
      username: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      avatar_url: avatarUrl,
    });
  }

  return { parentUrn: threadUrn, users, isCommentReaction: true };
}

export function linkedinParseReposts(
  payload: unknown,
  url: string,
): { parentUrn: string; users: LinkedInRepostEntry[] } | null {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  const repostData = data?.feedDashReshareFeedByReshareFeed as AnyRecord | undefined;
  if (!repostData) return null;

  let shareUrn = "";
  try {
    const u = new URL(url);
    const vars = u.searchParams.get("variables") || "";
    const match = vars.match(/targetUrn:([^,)]+)/);
    if (match?.[1]) shareUrn = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!shareUrn) return null;

  const elements = (repostData["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const users: LinkedInRepostEntry[] = [];
  const seenUrns = new Set<string>();
  const seenActivityUrns = new Set<string>();

  for (const elementUrn of elements) {
    const update = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!update || (update.$type as string) !== "com.linkedin.voyager.dash.feed.Update") continue;

    const actionsPos = (update.metadata as AnyRecord)?.actionsPosition as string | undefined;

    if (actionsPos === "HEADER_COMPONENT") {
      const header = update.header as AnyRecord | undefined;
      if (!header) continue;

      const textAttr = header.text as AnyRecord | undefined;
      const attrV2 = (textAttr?.attributesV2 as Array<AnyRecord>) || [];
      const detailData = attrV2[0]?.detailData as AnyRecord | undefined;
      const profileUrn = String(detailData?.["*profileFullName"] || "");
      if (!profileUrn) continue;

      const profile = byEntityUrn[profileUrn] as AnyRecord | undefined;
      const first = String(profile?.firstName || "");
      const last = String(profile?.lastName || "");
      const name =
        `${first} ${last}`.trim() ||
        String((header.text as AnyRecord)?.text || "").replace(/\s+reposted this.*$/, "");

      let avatarUrl = "";
      const imgDetail = ((header.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]
        ?.detailData as AnyRecord | undefined;
      if (imgDetail) {
        const vec =
          (imgDetail.nonEntityProfilePicture as AnyRecord)?.vectorImage ||
          (imgDetail.vectorImage as AnyRecord);
        avatarUrl = buildImageUrl(vec as AnyRecord);
      }

      if (seenUrns.has(profileUrn)) continue;
      seenUrns.add(profileUrn);

      users.push({ urn: profileUrn, name, avatar_url: avatarUrl });
    } else if (actionsPos === "ACTOR_COMPONENT") {
      const entry = extractRepostEntry(update, elementUrn, byEntityUrn);
      if (!entry?.activity_urn) continue;
      if (seenActivityUrns.has(entry.activity_urn)) continue;
      seenActivityUrns.add(entry.activity_urn);
      users.push(entry);
    }
  }

  return { parentUrn: shareUrn, users };
}

function extractRepostEntry(
  update: AnyRecord,
  elementUrn: string,
  byEntityUrn: Record<string, AnyRecord>,
): LinkedInRepostEntry | null {
  const actor = (update.actor as AnyRecord) || {};
  const commentary = update.commentary as AnyRecord | null | undefined;
  const content = (update.content as AnyRecord) || {};
  const metadata = (update.metadata as AnyRecord) || {};

  const authorName = String((actor.name as AnyRecord)?.text || "");
  const authorUrn = String(actor.backendUrn || "");
  if (!authorName && !authorUrn) return null;

  const activityIdMatch = String(elementUrn).match(/urn:li:activity:(\d+)/);
  const activityUrn = String(
    metadata.backendUrn || (activityIdMatch ? `urn:li:activity:${activityIdMatch[1]}` : ""),
  );
  if (!activityUrn) return null;

  let avatarVectorImage: AnyRecord | null = null;
  const imgDetail = ((actor.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]?.detailData as
    | AnyRecord
    | undefined;
  if (imgDetail) {
    const companyLogo = imgDetail.nonEntityCompanyLogo as AnyRecord | undefined;
    if (companyLogo) avatarVectorImage = companyLogo.vectorImage as AnyRecord | null;
    if (!avatarVectorImage) {
      const profilePic =
        (imgDetail.nonEntityProfilePicture as AnyRecord) || (imgDetail.profilePicture as AnyRecord);
      avatarVectorImage = (profilePic?.vectorImage as AnyRecord) || null;
    }
  }

  return {
    id: elementUrn,
    activity_urn: activityUrn,
    share_urn: String(metadata.shareUrn || ""),
    text: String((commentary?.text as AnyRecord)?.text || ""),
    type: "repost",
    author: {
      urn: authorUrn,
      name: authorName,
      headline: String((actor.description as AnyRecord)?.text || ""),
      avatar_url: buildImageUrl(avatarVectorImage),
      vanity_name: "",
    },
    metrics: extractMetricsDeep(update, byEntityUrn),
    hashtags: extractHashtags(commentary, byEntityUrn),
    media: extractMediaItems(content.imageComponent as AnyRecord | null | undefined),
  };
}

export function linkedinParseComments(
  payload: unknown,
  url: string,
): { parentUrn: string; comments: SocialComment[] } | null {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  const commentsData = data?.socialDashCommentsBySocialDetail as AnyRecord | undefined;
  if (!commentsData) return null;

  let shareUrn = "";
  try {
    const u = new URL(url);
    const vars = u.searchParams.get("variables") || "";
    const match = vars.match(/urn:li:activity:(\d+)/) || vars.match(/urn:li:ugcPost:(\d+)/);
    if (match) shareUrn = match[0];
  } catch {
    return null;
  }
  if (!shareUrn) return null;

  const elements = (commentsData["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const existingIds = new Set<string>();
  const comments: SocialComment[] = [];

  for (const elementUrn of elements) {
    const comment = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!comment || (comment.$type as string) !== "com.linkedin.voyager.dash.social.Comment")
      continue;

    const item = extractCommentItem(comment, byEntityUrn, existingIds);
    if (item) {
      item.publication_id = shareUrn;
      comments.push(item);

      const replies = extractCommentReplies(
        comment,
        byEntityUrn,
        existingIds,
        shareUrn,
        item.comment_id,
        1,
        3,
      );
      comments.push(...replies);
    }
  }

  return { parentUrn: shareUrn, comments };
}

function extractCommentItem(
  comment: AnyRecord,
  _byEntityUrn: Record<string, AnyRecord>,
  existingIds: Set<string>,
): SocialComment | null {
  const commenter = (comment.commenter as AnyRecord) || {};
  const name = String((commenter.title as AnyRecord)?.text || "");
  const urn = String(commenter.urn || "");

  let avatarUrl = "";
  const imgDetail = ((commenter.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]
    ?.detailData as AnyRecord | undefined;
  if (imgDetail) {
    const vec =
      (imgDetail.nonEntityProfilePicture as AnyRecord)?.vectorImage ||
      (imgDetail.vectorImage as AnyRecord);
    avatarUrl = buildImageUrl(vec as AnyRecord);
  }

  const commentId = String(comment.entityUrn || "");
  if (!commentId || existingIds.has(commentId)) return null;
  existingIds.add(commentId);

  return {
    provider: "linkedin",
    comment_id: commentId,
    publication_id: "",
    text: String((comment.commentary as AnyRecord)?.text || ""),
    created_at: "",
    author: {
      provider: "linkedin",
      provider_user_id: urn,
      username: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      avatar_url: avatarUrl,
    },
    like_count: 0,
    parent_comment_id: null,
  };
}

function extractCommentReplies(
  comment: AnyRecord,
  byEntityUrn: Record<string, AnyRecord>,
  existingIds: Set<string>,
  publicationId: string,
  parentCommentId: string,
  depth: number,
  maxDepth = 3,
): SocialComment[] {
  if (depth >= maxDepth) return [];

  const socialDetailRef = comment["*socialDetail"] as string | undefined;
  if (!socialDetailRef) return [];

  const socialDetail = byEntityUrn[socialDetailRef] as AnyRecord | undefined;
  if (!socialDetail?.comments) return [];

  const commentsRecord = socialDetail.comments as AnyRecord;
  const replyElements: unknown[] =
    (commentsRecord["*elements"] as unknown[]) || (commentsRecord.elements as unknown[]) || [];

  const replies: SocialComment[] = [];

  for (const replyUrn of replyElements) {
    if (typeof replyUrn !== "string") continue;
    const replyComment = byEntityUrn[replyUrn] as AnyRecord | undefined;
    if (
      !replyComment ||
      (replyComment.$type as string) !== "com.linkedin.voyager.dash.social.Comment"
    )
      continue;

    const commenter = (replyComment.commenter as AnyRecord) || {};
    const name = String((commenter.title as AnyRecord)?.text || "");
    const urn = String(commenter.urn || "");

    let avatarUrl = "";
    const imgDetail = ((commenter.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]
      ?.detailData as AnyRecord | undefined;
    if (imgDetail) {
      const vec =
        (imgDetail.nonEntityProfilePicture as AnyRecord)?.vectorImage ||
        (imgDetail.vectorImage as AnyRecord);
      avatarUrl = buildImageUrl(vec as AnyRecord);
    }

    const commentId = String(replyComment.entityUrn || "");
    if (!commentId || existingIds.has(commentId)) continue;
    existingIds.add(commentId);

    replies.push({
      provider: "linkedin",
      comment_id: commentId,
      publication_id: publicationId,
      text: String((replyComment.commentary as AnyRecord)?.text || ""),
      created_at: "",
      author: {
        provider: "linkedin",
        provider_user_id: urn,
        username: name.toLowerCase().replace(/\s+/g, "_"),
        name,
        avatar_url: avatarUrl,
      },
      like_count: 0,
      parent_comment_id: parentCommentId,
    });

    const nested = extractCommentReplies(
      replyComment,
      byEntityUrn,
      existingIds,
      publicationId,
      commentId,
      depth + 1,
      maxDepth,
    );
    replies.push(...nested);
  }

  return replies;
}

function extractMediaItems(
  imageComponent: AnyRecord | null | undefined,
): Array<{ type: string; url: string; width: number; height: number }> {
  if (!imageComponent) return [];
  const images = (imageComponent.images as Array<AnyRecord>) || [];
  return images.map((img) => {
    const attr = (img.attributes as Array<AnyRecord>)?.[0] as AnyRecord | undefined;
    const vectorImage = (attr?.detailData as AnyRecord)?.vectorImage as AnyRecord | undefined;
    const url = buildImageUrl(vectorImage);
    let width = 0;
    let height = 0;
    const artifacts = (vectorImage?.artifacts as Array<AnyRecord>) || [];
    if (artifacts.length) {
      const best = artifacts.reduce((a: AnyRecord, b: AnyRecord) =>
        (a.width as number) > (b.width as number) ? a : b,
      );
      width = (best.width as number) || 0;
      height = (best.height as number) || 0;
    }
    return { type: "image", url, width, height };
  });
}

function extractMetricsDeep(
  update: AnyRecord,
  byEntityUrn: Record<string, AnyRecord>,
): LinkedInPostData["metrics"] {
  const metrics: LinkedInPostData["metrics"] = {
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    total_reactions: 0,
    reaction_breakdown: {},
  };

  const socialDetailRef = update["*socialDetail"] as string | undefined;
  if (!socialDetailRef) return metrics;
  const socialDetail = byEntityUrn[socialDetailRef] as AnyRecord | undefined;
  if (!socialDetail) return metrics;
  const countsRef = socialDetail["*totalSocialActivityCounts"] as string | undefined;
  if (!countsRef) return metrics;
  const counts = byEntityUrn[countsRef] as AnyRecord | undefined;
  if (!counts) return metrics;

  metrics.like_count = (counts.numLikes as number) || 0;
  metrics.comment_count = (counts.numComments as number) || 0;
  metrics.share_count = (counts.numShares as number) || 0;
  const typeCounts = (counts.reactionTypeCounts as Array<AnyRecord>) || [];
  let total = 0;
  const breakdown: Record<string, number> = {};
  for (const r of typeCounts) {
    const type = String(r.reactionType || "");
    const count = (r.count as number) || 0;
    total += count;
    if (type) breakdown[type] = count;
  }
  metrics.total_reactions = total;
  metrics.reaction_breakdown = breakdown;

  return metrics;
}

export function linkedinFeedToPosts(payload: unknown, trackedHandle: string): LinkedInPostData[] {
  const data = ((payload as AnyRecord)?.data as AnyRecord)?.data as AnyRecord | undefined;
  if (!data) return [];

  const feedKey = Object.keys(data).find((k) =>
    Array.isArray((data[k] as AnyRecord)?.["*elements"]),
  );
  if (!feedKey) return [];

  const feed = data[feedKey] as AnyRecord;
  const elements = (feed["*elements"] as string[]) || [];
  const included = ((payload as AnyRecord)?.included as Array<AnyRecord>) || [];
  if (!elements.length) return [];

  const byEntityUrn: Record<string, AnyRecord> = {};
  for (const item of included) {
    const entityUrn = item.entityUrn as string | undefined;
    if (entityUrn) byEntityUrn[entityUrn] = item;
  }

  const handle = trackedHandle.toLowerCase();
  const posts: LinkedInPostData[] = [];

  for (const elementUrn of elements) {
    const update = byEntityUrn[elementUrn] as AnyRecord | undefined;
    if (!update || (update.$type as string) !== "com.linkedin.voyager.dash.feed.Update") continue;

    const activityIdMatch = String(elementUrn).match(/urn:li:activity:(\d+)/);
    if (!activityIdMatch) continue;

    const actor = (update.actor as AnyRecord) || {};
    const commentary = update.commentary as AnyRecord | null | undefined;
    const header = update.header as AnyRecord | undefined;
    const content = (update.content as AnyRecord) || {};
    const metadata = (update.metadata as AnyRecord) || {};

    const authorName = String((actor.name as AnyRecord)?.text || "");
    const authorUrn = String(actor.backendUrn || "");
    const actorDesc = String((actor.description as AnyRecord)?.text || "");
    const subDesc = String((actor.subDescription as AnyRecord)?.text || "");

    const isRepost = Boolean(
      header?.text &&
        typeof header.text === "object" &&
        String((header.text as AnyRecord).text || "").includes("reposted"),
    );

    if (handle && !authorName.toLowerCase().includes(handle)) {
      const headerText = String((header?.text as AnyRecord)?.text || "");
      if (!headerText.toLowerCase().includes(handle)) continue;
    }

    let avatarVectorImage: AnyRecord | null = null;
    let companyUrn = "";
    const imgDetail = ((actor.image as AnyRecord)?.attributes as Array<AnyRecord>)?.[0]
      ?.detailData as AnyRecord | undefined;
    if (imgDetail) {
      const companyLogo = imgDetail.nonEntityCompanyLogo as AnyRecord | undefined;
      if (companyLogo) {
        companyUrn = String(companyLogo["*company"] || "");
        avatarVectorImage = companyLogo.vectorImage as AnyRecord | null;
      }
      if (!avatarVectorImage) {
        const profilePic =
          (imgDetail.nonEntityProfilePicture as AnyRecord) ||
          (imgDetail.profilePicture as AnyRecord);
        avatarVectorImage = (profilePic?.vectorImage as AnyRecord) || null;
      }
    }

    let vanityName = "";
    if (companyUrn) {
      const company = byEntityUrn[companyUrn] as AnyRecord | undefined;
      if (company?.url) {
        vanityName = String(company.url).replace(/\/$/, "").split("/").pop() || "";
      }
    }

    const metaUrn = String(metadata.backendUrn || "");
    const shareUrn = String(metadata.shareUrn || "");
    const commentaryText = String((commentary?.text as AnyRecord)?.text || "");
    const hashtags = extractHashtags(commentary, byEntityUrn);
    const media = extractMediaItems(content.imageComponent as AnyRecord | null | undefined);
    const metrics = extractMetricsDeep(update, byEntityUrn);

    const post: LinkedInPostData = {
      id: elementUrn,
      activity_urn: metaUrn || `urn:li:activity:${activityIdMatch[1]}`,
      share_urn: shareUrn,
      text: commentaryText,
      type: isRepost ? "repost" : "original",
      author: {
        urn: authorUrn,
        name: authorName,
        headline: actorDesc,
        avatar_url: buildImageUrl(avatarVectorImage),
        vanity_name: vanityName,
      },
      metrics,
      hashtags,
      media,
      created_at: "",
      timestamp_text: subDesc,
      source: "company_feed",
    };

    if (isRepost && header) {
      const headerText = String((header.text as AnyRecord)?.text || "");
      const reposterName = headerText.replace(/\s+reposted this.*$/, "");
      post.reposted_by = {
        name: reposterName || authorName,
        original_author: authorName,
      };
    }

    posts.push(post);
  }

  return posts;
}
