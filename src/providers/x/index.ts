import {
  storeEngagement,
  storePublication,
  trackedHandleForProvider,
} from "../../background/store";
import type { BackgroundStore, ExportSummaryX, ExportV3PlatformX } from "../../shared/domain";
import type { CapturedPayloadMessage } from "../../shared/messages";
import type { BackgroundProviderFacet, ScopeMode } from "../contract";
import { publicationKey } from "../shared/utils";
import {
  accountInfoFromUser,
  accountInfoToTrackedProfile,
  favoriterToEngagement,
  processFavoritersPayload,
  processUserTweetsPayload,
} from "./parser";

type AnyRecord = Record<string, any>;

export function processXCapture(store: BackgroundStore, request: CapturedPayloadMessage) {
  const trackedHandle = trackedHandleForProvider(store, "x");
  const handle = trackedHandle.toLowerCase();
  const xstore = store.platforms.x;

  if (request.endpoint === "UserTweets") {
    processUserTweetsPayload(request.payload, trackedHandle, (tweet, publication, rawResult) => {
      const authorHandle = tweet.author.screen_name.toLowerCase();

      if (authorHandle === handle) {
        if (!xstore.accountInfo && tweet.author.rest_id) {
          const authorResult = rawResult.core?.user_results?.result;
          const info = accountInfoFromUser(authorResult || {}, tweet);
          xstore.accountInfo = info;
          store.trackedProfiles.x = accountInfoToTrackedProfile(info);
        }
        xstore.tweets[tweet.tweet_id] = tweet;
        storePublication(store, publication);
      }

      if (tweet.in_reply_to_screen_name?.toLowerCase() === handle && authorHandle !== handle) {
        xstore.communityReplies[tweet.tweet_id] = publication;
        storePublication(store, publication);
        storeEngagement(store, {
          provider: "x",
          publication_id: tweet.in_reply_to_tweet_id || tweet.tweet_id,
          kind: "comment",
          engagement_id: publicationKey(
            "x",
            `${tweet.in_reply_to_tweet_id || tweet.tweet_id}:reply:${tweet.tweet_id}`,
          ),
          actor: publication.author,
          engaged_at: tweet.created_at,
        });
      }
    });
  }

  if (request.endpoint === "Favoriters") {
    const users = processFavoritersPayload(request.payload);
    const tweetIdMatch = (request.pageUrl || "").match(/status\/(\d+)/);
    if (tweetIdMatch && users.length) {
      const tweetId = tweetIdMatch[1] || "";
      if (!xstore.favoriters[tweetId]) xstore.favoriters[tweetId] = [];
      const existing = new Set(xstore.favoriters[tweetId].map((u) => u.rest_id));
      const freshUsers = users.filter((u) => !existing.has(u.rest_id));
      xstore.favoriters[tweetId].push(...freshUsers);
      for (const user of freshUsers) {
        storeEngagement(store, favoriterToEngagement(tweetId, user));
      }
    }
  }

  if (request.endpoint === "UserByScreenName") {
    const user = (request.payload as AnyRecord)?.data?.user?.result;
    if (
      user &&
      trackedHandleForProvider(store, "x") &&
      user.core?.screen_name?.toLowerCase() === trackedHandleForProvider(store, "x").toLowerCase()
    ) {
      const info = accountInfoFromUser(user);
      xstore.accountInfo = info;
      store.trackedProfiles.x = accountInfoToTrackedProfile(info);
    }
  }
}

export function buildPlatformDataX(store: BackgroundStore): ExportV3PlatformX {
  const xstore = store.platforms.x;
  return {
    content: Object.values(xstore.tweets).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
    engagers: {
      likes_by_tweet: xstore.favoriters,
      replies: Object.values(xstore.communityReplies),
    },
  };
}

export function computeSummaryX(store: BackgroundStore): ExportSummaryX {
  const xstore = store.platforms.x;
  const pubs = Object.values(xstore.publications);
  const tweets = Object.values(xstore.tweets);
  return {
    total_content: pubs.length,
    total_likes: pubs.reduce((s, p) => s + p.metrics.like_count, 0),
    total_retweets: tweets.reduce((s, t) => s + t.metrics.retweet_count, 0),
    total_replies: Object.values(xstore.commentsByPublication).flat().length,
    total_quotes: tweets.reduce((s, t) => s + t.metrics.quote_count, 0),
    total_bookmarks: tweets.reduce((s, t) => s + t.metrics.bookmark_count, 0),
    total_views: pubs.reduce((s, p) => s + p.metrics.view_count, 0),
  };
}

// Modos de Scope declaráveis (#9). O filtro real continua dentro de processXCapture
// (compara author.screen_name com o handle rastreado); aqui só tornamos o modo
// "profile" declarável — selects() casa pelo username do autor (= screen_name no X).
export const scopeModes: ScopeMode[] = [
  {
    id: "profile",
    label: "Profile",
    selects: (pub, value) => pub.author.username?.toLowerCase() === value.toLowerCase(),
  },
];

export const xProvider: BackgroundProviderFacet = {
  id: "x",
  processCapture: processXCapture,
};
