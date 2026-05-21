import type {
  AccountInfo,
  Favoriter,
  SocialActor,
  SocialPublication,
  TrackedProfile,
  TweetData,
} from "../../shared/domain";
import { type AnyRecord, emptyMetrics, publicationKey } from "../shared/utils";

export function extractTweetData(result: AnyRecord | null | undefined): TweetData | null {
  if (!result || result.__typename !== "Tweet") return null;
  const legacy = result.legacy || {};
  const authorResult = result.core?.user_results?.result;
  const authorCore = authorResult?.core || {};
  const authorLegacy = authorResult?.legacy || {};
  const views = result.views || {};

  const isRetweet = !!legacy.retweeted_status_result;
  const isReply = !!legacy.in_reply_to_status_id_str;
  const isQuote = legacy.is_quote_status && !!legacy.quoted_status_id_str && !isRetweet;

  let type: TweetData["type"] = "original";
  if (isRetweet) type = "retweet";
  else if (isReply) type = "reply";
  else if (isQuote) type = "quote";

  const sourceMatch = String(result.source || "").match(/>([^<]+)</);

  return {
    tweet_id: legacy.id_str || result.rest_id || "",
    text: legacy.full_text || "",
    created_at: legacy.created_at || "",
    type,
    lang: legacy.lang || "",
    author: {
      screen_name: authorCore.screen_name || "",
      name: authorCore.name || "",
      rest_id: authorResult?.rest_id || "",
      avatar_url: authorResult?.avatar?.image_url || "",
      followers_count: authorLegacy.followers_count || 0,
      is_blue_verified: authorResult?.is_blue_verified || false,
    },
    metrics: {
      favorite_count: legacy.favorite_count || 0,
      retweet_count: legacy.retweet_count || 0,
      reply_count: legacy.reply_count || 0,
      quote_count: legacy.quote_count || 0,
      bookmark_count: legacy.bookmark_count || 0,
      view_count: Number.parseInt(views.count, 10) || 0,
    },
    hashtags: (legacy.entities?.hashtags || []).map((h: AnyRecord) => h.text),
    user_mentions: (legacy.entities?.user_mentions || []).map((m: AnyRecord) => ({
      screen_name: m.screen_name,
      name: m.name,
    })),
    media_count: (legacy.extended_entities?.media || legacy.entities?.media || []).length,
    urls: (legacy.entities?.urls || []).map((u: AnyRecord) => u.expanded_url || u.display_url),
    source: sourceMatch ? sourceMatch[1] || "" : "",
    in_reply_to_tweet_id: legacy.in_reply_to_status_id_str || null,
    in_reply_to_screen_name: legacy.in_reply_to_screen_name || null,
    quoted_tweet_id: legacy.quoted_status_id_str || null,
    retweeted_tweet_id: isRetweet ? legacy.retweeted_status_result?.result?.rest_id || null : null,
  };
}

export function tweetToPublication(tweet: TweetData): SocialPublication {
  const metrics = emptyMetrics();
  metrics.like_count = tweet.metrics.favorite_count;
  metrics.retweet_count = tweet.metrics.retweet_count;
  metrics.repost_count = tweet.metrics.retweet_count;
  metrics.reply_count = tweet.metrics.reply_count;
  metrics.comment_count = tweet.metrics.reply_count;
  metrics.quote_count = tweet.metrics.quote_count;
  metrics.bookmark_count = tweet.metrics.bookmark_count;
  metrics.save_count = tweet.metrics.bookmark_count;
  metrics.view_count = tweet.metrics.view_count;

  const author: SocialActor = {
    provider: "x",
    provider_user_id: tweet.author.rest_id,
    username: tweet.author.screen_name,
    name: tweet.author.name,
    full_name: tweet.author.name,
    avatar_url: tweet.author.avatar_url,
    followers_count: tweet.author.followers_count,
    is_verified: tweet.author.is_blue_verified,
  };

  return {
    provider: "x",
    publication_id: tweet.tweet_id,
    text: tweet.text,
    created_at: tweet.created_at,
    type: tweet.type,
    raw_type: tweet.type,
    author,
    metrics,
    hashtags: tweet.hashtags,
    user_mentions: tweet.user_mentions.map((mention) => ({
      name: mention.name,
      username: mention.screen_name,
    })),
    media_count: tweet.media_count,
    urls: tweet.urls,
    source: tweet.source,
    url: `https://x.com/${tweet.author.screen_name}/status/${tweet.tweet_id}`,
    in_reply_to_publication_id: tweet.in_reply_to_tweet_id,
    in_reply_to_username: tweet.in_reply_to_screen_name,
    quoted_publication_id: tweet.quoted_tweet_id,
    reposted_publication_id: tweet.retweeted_tweet_id,
    reposted_publication: tweet.retweeted_tweet
      ? {
          publication_id: tweet.retweeted_tweet.tweet_id,
          text: tweet.retweeted_tweet.text,
          author: {
            provider: "x",
            provider_user_id: tweet.retweeted_tweet.author.rest_id,
            username: tweet.retweeted_tweet.author.screen_name,
            name: tweet.retweeted_tweet.author.name,
            avatar_url: tweet.retweeted_tweet.author.avatar_url,
            followers_count: tweet.retweeted_tweet.author.followers_count,
            is_verified: tweet.retweeted_tweet.author.is_blue_verified,
          },
          metrics,
        }
      : undefined,
  };
}

export function processUserTweetsPayload(
  payload: unknown,
  handle: string,
  onTweet: (tweet: TweetData, publication: SocialPublication, rawResult: AnyRecord) => void,
) {
  const normalizedHandle = handle.toLowerCase();
  if (!normalizedHandle) return;

  const instructions =
    (payload as AnyRecord)?.data?.user?.result?.timeline?.timeline?.instructions || [];

  for (const instruction of instructions) {
    if (instruction.type === "TimelinePinEntry" && instruction.entry) {
      processEntry(instruction.entry, normalizedHandle, onTweet);
    }
    if (instruction.type === "TimelineAddEntries") {
      for (const entry of instruction.entries || []) {
        processEntry(entry, normalizedHandle, onTweet);
      }
    }
  }
}

function processEntry(
  entry: AnyRecord,
  handle: string,
  onTweet: (tweet: TweetData, publication: SocialPublication, rawResult: AnyRecord) => void,
) {
  const content = entry?.content;
  if (!content) return;

  if (content.__typename === "TimelineTimelineItem" && content.itemContent?.tweet_results?.result) {
    processTweetResult(content.itemContent.tweet_results.result, handle, onTweet);
  }

  if (content.__typename === "TimelineTimelineModule" && content.items) {
    for (const item of content.items) {
      const result = item?.item?.itemContent?.tweet_results?.result;
      if (result) processTweetResult(result, handle, onTweet);
    }
  }
}

function processTweetResult(
  result: AnyRecord,
  _handle: string,
  onTweet: (tweet: TweetData, publication: SocialPublication, rawResult: AnyRecord) => void,
) {
  const tweet = extractTweetData(result);
  if (!tweet) return;

  if (tweet.type === "retweet") {
    const original = result.legacy?.retweeted_status_result?.result;
    if (original) {
      const origTweet = extractTweetData(original);
      if (origTweet) {
        tweet.retweeted_tweet = {
          tweet_id: origTweet.tweet_id,
          text: origTweet.text,
          author: origTweet.author,
          metrics: origTweet.metrics,
        };
      }
    }
  }

  onTweet(tweet, tweetToPublication(tweet), result);
}

export function accountInfoFromUser(user: AnyRecord, fallbackTweet?: TweetData): AccountInfo {
  const legacy = user.legacy || {};
  return {
    screen_name: user.core?.screen_name || fallbackTweet?.author.screen_name || "",
    name: user.core?.name || fallbackTweet?.author.name || "",
    rest_id: user.rest_id || fallbackTweet?.author.rest_id || "",
    avatar_url: user.avatar?.image_url || fallbackTweet?.author.avatar_url || "",
    followers_count: legacy.followers_count || fallbackTweet?.author.followers_count || 0,
    friends_count: legacy.friends_count || 0,
    statuses_count: legacy.statuses_count || 0,
    description: legacy.description || "",
    is_blue_verified: user.is_blue_verified || fallbackTweet?.author.is_blue_verified || false,
  };
}

export function accountInfoToTrackedProfile(account: AccountInfo): TrackedProfile {
  return {
    provider: "x",
    username: account.screen_name,
    name: account.name,
    provider_user_id: account.rest_id,
    avatar_url: account.avatar_url,
    followers_count: account.followers_count,
    following_count: account.friends_count,
    statuses_count: account.statuses_count,
    description: account.description,
    is_verified: account.is_blue_verified,
  };
}

export function processFavoritersPayload(payload: unknown): Favoriter[] {
  const instructions =
    (payload as AnyRecord)?.data?.favoriters_timeline?.timeline?.instructions || [];
  const users: Favoriter[] = [];
  for (const instruction of instructions) {
    for (const entry of instruction?.entries || []) {
      const content = entry?.content;
      if (content?.__typename !== "TimelineTimelineItem") continue;
      const result = content?.itemContent?.user_results?.result;
      if (!result || result?.__typename !== "User") continue;
      const core = result?.core || {};
      const legacy = result?.legacy || {};
      const rel = result?.relationship_perspectives || {};
      users.push({
        rest_id: result.rest_id || "",
        screen_name: core.screen_name || "",
        name: core.name || "",
        followers_count: legacy.followers_count || 0,
        is_blue_verified: result.is_blue_verified || false,
        following: rel.following || false,
        followed_by: rel.followed_by || false,
      });
    }
  }
  return users;
}

export function favoriterToEngagement(tweetId: string, user: Favoriter) {
  return {
    provider: "x" as const,
    publication_id: tweetId,
    engagement_id: publicationKey("x", `${tweetId}:like:${user.rest_id || user.screen_name}`),
    kind: "like" as const,
    actor: {
      provider: "x" as const,
      provider_user_id: user.rest_id,
      username: user.screen_name,
      name: user.name,
      avatar_url: "",
      followers_count: user.followers_count,
      following: user.following,
      is_verified: user.is_blue_verified,
    },
  };
}
