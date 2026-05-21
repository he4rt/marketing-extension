import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import type { BackgroundStore } from "../src/shared/domain";
import type { RuntimeMessage } from "../src/shared/messages";
import {
  alternateUserTweetsPayload,
  favoritersPayload,
  userByScreenNamePayload,
  userTweetsPayload,
} from "./fixtures/twitter-payloads";

function createHarness(initialHandle = "") {
  const store = createStore(initialHandle);
  const persisted: Record<string, string> = {};
  const logs: string[] = [];

  function sendMessage(request: RuntimeMessage) {
    return JSON.parse(
      JSON.stringify(
        handleRuntimeMessage(store, request, {
          log: (message) => logs.push(message),
          persistHandle: (handle) => {
            persisted.trackedHandle = handle;
          },
        }),
      ),
    );
  }

  return { logs, persisted, sendMessage, store };
}

function capture(
  harness: ReturnType<typeof createHarness>,
  endpoint: string,
  payload: unknown,
  pageUrl: string,
  timestamp = "2026-05-20T12:00:00.000Z",
) {
  return harness.sendMessage({
    action: "GRAPHQL_CAPTURED",
    endpoint,
    payload,
    timestamp,
    pageUrl,
  });
}

describe("background controller", () => {
  test("expõe o handle persistido através de GET_HANDLE", () => {
    const app = createHarness("He4rtDevs");

    expect(app.sendMessage({ action: "GET_HANDLE" })).toEqual({ handle: "He4rtDevs" });
  });

  test("captura UserTweets, processa timeline aninhada e deduplica por tweet id", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "He4rtDevs" });
    capture(app, "UserTweets", userTweetsPayload, "https://x.com/He4rtDevs");

    const response = app.sendMessage({ action: "GET_TWEETS" }) as {
      accountInfo: BackgroundStore["accountInfo"];
      lastUpdated: null | string;
      replyCount: number;
      tweets: BackgroundStore["tweets"][string][];
    };
    const tweetsById = Object.fromEntries(response.tweets.map((tweet) => [tweet.tweet_id, tweet]));

    expect(response.tweets).toHaveLength(4);
    expect(response.replyCount).toBe(1);
    expect(response.accountInfo?.screen_name).toBe("He4rtDevs");
    expect(tweetsById["100"]?.type).toBe("original");
    expect(tweetsById["100"]?.media_count).toBe(2);
    expect(tweetsById["100"]?.hashtags).toEqual(["He4rtDevelopers"]);
    expect(tweetsById["100"]?.metrics.view_count).toBe(1000);
    expect(tweetsById["101"]?.type).toBe("quote");
    expect(tweetsById["102"]?.type).toBe("reply");
    expect(tweetsById["103"]?.type).toBe("retweet");
    expect(tweetsById["103"]?.retweeted_tweet?.tweet_id).toBe("800");
    expect(response.lastUpdated).toBe("2026-05-20T12:00:00.000Z");
  });

  test("captura metadados de UserByScreenName para o handle rastreado", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "He4rtDevs" });
    capture(
      app,
      "UserByScreenName",
      userByScreenNamePayload,
      "https://x.com/He4rtDevs",
      "2026-05-20T12:01:00.000Z",
    );

    const response = app.sendMessage({ action: "GET_TWEETS" }) as {
      accountInfo: BackgroundStore["accountInfo"];
    };

    expect(response.accountInfo).toEqual({
      screen_name: "He4rtDevs",
      name: "He4rt Developers",
      rest_id: "tracked-1",
      avatar_url: "https://img.example/He4rtDevs.jpg",
      followers_count: 20945,
      friends_count: 320,
      statuses_count: 2178,
      description: "Open source community",
      is_blue_verified: true,
    });
  });

  test("vincula payloads Favoriters ao tweet id extraído da URL atual", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "He4rtDevs" });
    capture(
      app,
      "Favoriters",
      favoritersPayload,
      "https://x.com/He4rtDevs/status/100/likes",
      "2026-05-20T12:02:00.000Z",
    );
    capture(
      app,
      "Favoriters",
      favoritersPayload,
      "https://x.com/He4rtDevs/status/100/likes",
      "2026-05-20T12:03:00.000Z",
    );

    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      favoriters_by_tweet: BackgroundStore["favoriters"];
    };

    expect(exported.favoriters_by_tweet["100"]).toHaveLength(2);
    expect(exported.favoriters_by_tweet["100"]?.map((user) => user.screen_name)).toEqual([
      "first_fan",
      "second_fan",
    ]);
    expect(exported.favoriters_by_tweet["100"]?.[0]?.followers_count).toBe(1000);
    expect(exported.favoriters_by_tweet["100"]?.[0]?.following).toBe(true);
  });

  test("reprocessa payloads UserTweets em cache após mudança de SET_HANDLE", () => {
    const app = createHarness();

    capture(
      app,
      "UserTweets",
      userTweetsPayload,
      "https://x.com/He4rtDevs",
      "2026-05-20T12:04:00.000Z",
    );
    capture(
      app,
      "UserTweets",
      alternateUserTweetsPayload,
      "https://x.com/OtherHandle",
      "2026-05-20T12:05:00.000Z",
    );

    const setResponse = app.sendMessage({ action: "SET_HANDLE", handle: "OtherHandle" }) as {
      tweetCount: number;
    };
    const response = app.sendMessage({ action: "GET_TWEETS" }) as {
      tweets: BackgroundStore["tweets"][string][];
    };

    expect(setResponse.tweetCount).toBe(1);
    expect(response.tweets).toHaveLength(1);
    expect(response.tweets[0]?.tweet_id).toBe("300");
    expect(response.tweets[0]?.author.screen_name).toBe("OtherHandle");
    expect(app.persisted.trackedHandle).toBe("OtherHandle");
  });

  test("monta export JSON, resumo e visualizações raw de endpoints", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "He4rtDevs" });
    capture(
      app,
      "UserTweets",
      userTweetsPayload,
      "https://x.com/He4rtDevs",
      "2026-05-20T12:06:00.000Z",
    );
    capture(
      app,
      "Favoriters",
      favoritersPayload,
      "https://x.com/He4rtDevs/status/100/likes",
      "2026-05-20T12:07:00.000Z",
    );

    const endpoints = app.sendMessage({ action: "GET_ENDPOINTS" }) as {
      endpoints: Record<string, { count: number }>;
    };
    const userTweetPayloads = app.sendMessage({
      action: "GET_ENDPOINT_PAYLOADS",
      endpoint: "UserTweets",
    }) as { payloads: unknown[] };
    const allRaw = app.sendMessage({ action: "GET_ALL_RAW" }) as {
      endpoints: Record<string, { count: number }>;
    };
    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      community_replies: unknown[];
      summary: Record<string, unknown>;
      tracked_account: { screen_name: string };
      tweets: unknown[];
    };

    expect(Object.keys(endpoints.endpoints).sort()).toEqual(["Favoriters", "UserTweets"]);
    expect(endpoints.endpoints.UserTweets?.count).toBe(1);
    expect(userTweetPayloads.payloads).toHaveLength(1);
    expect(allRaw.endpoints.Favoriters?.count).toBe(1);

    expect(exported.tracked_account.screen_name).toBe("He4rtDevs");
    expect(exported.tweets).toHaveLength(4);
    expect(exported.community_replies).toHaveLength(1);
    expect(exported.summary.total_tweets).toBe(4);
    expect(exported.summary.total_original).toBe(1);
    expect(exported.summary.total_retweets).toBe(1);
    expect(exported.summary.total_quotes).toBe(1);
    expect(exported.summary.total_replies_from_account).toBe(1);
    expect(exported.summary.total_community_replies).toBe(1);
    expect(exported.summary.total_likes).toBe(15);
    expect(exported.summary.total_views).toBe(1000);
    expect(exported.summary.total_reply_engagement).toBe(2);
    expect(exported.summary.avg_likes_per_original).toBe(15);
    expect(exported.summary.avg_views_per_original).toBe(1000);
    expect(exported.summary.unique_engagers).toBe(3);
    expect(exported.summary.top_tweet_by_likes).toBe("100");
    expect(exported.summary.top_tweet_by_views).toBe("100");
  });

  test("CLEAR_ALL limpa dados capturados e mantém handle rastreado", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "He4rtDevs" });
    capture(
      app,
      "UserTweets",
      userTweetsPayload,
      "https://x.com/He4rtDevs",
      "2026-05-20T12:08:00.000Z",
    );
    app.sendMessage({ action: "CLEAR_ALL" });

    const tweets = app.sendMessage({ action: "GET_TWEETS" }) as {
      replyCount: number;
      tweets: unknown[];
    };
    const endpoints = app.sendMessage({ action: "GET_ENDPOINTS" }) as {
      endpoints: Record<string, unknown>;
    };
    const handle = app.sendMessage({ action: "GET_HANDLE" });

    expect(tweets.tweets).toHaveLength(0);
    expect(tweets.replyCount).toBe(0);
    expect(endpoints.endpoints).toEqual({});
    expect(handle).toEqual({ handle: "He4rtDevs" });
  });
});
