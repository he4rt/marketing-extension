import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import type { BackgroundStore } from "../src/shared/domain";
import type { RuntimeMessage } from "../src/shared/messages";
import {
  instagramChildCommentsPayload,
  instagramCommentsPayload,
  instagramFeedPayload,
  instagramLikersPayload,
  instagramPostPagePayload,
  instagramSingleMediaPayload,
} from "./fixtures/instagram-payloads";
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
  provider: "instagram" | "x" = "x",
) {
  return harness.sendMessage({
    action: "CAPTURED_PAYLOAD",
    provider,
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

  test("mantém filtros separados por provider", () => {
    const app = createHarness();

    app.sendMessage({
      action: "SET_HANDLE",
      handle: "he4rtdevs",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
    });
    app.sendMessage({
      action: "SET_HANDLE",
      handle: "He4rtDevs",
      provider: "x",
      pageUrl: "https://x.com/He4rtDevs",
    });

    expect(app.sendMessage({ action: "GET_HANDLE", provider: "instagram" })).toEqual({
      handle: "he4rtdevs",
    });
    expect(app.sendMessage({ action: "GET_HANDLE", provider: "x" })).toEqual({
      handle: "He4rtDevs",
    });
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
      per_platform: { x: { engagers: { likes_by_tweet: BackgroundStore["favoriters"] } } };
    };

    expect(exported.per_platform.x.engagers.likes_by_tweet["100"]).toHaveLength(2);
    expect(exported.per_platform.x.engagers.likes_by_tweet["100"]?.map((user) => user.screen_name)).toEqual([
      "first_fan",
      "second_fan",
    ]);
    expect(exported.per_platform.x.engagers.likes_by_tweet["100"]?.[0]?.followers_count).toBe(1000);
    expect(exported.per_platform.x.engagers.likes_by_tweet["100"]?.[0]?.following).toBe(true);
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
      meta: { profiles: Record<string, { username: string }> };
      per_platform: {
        x: { content: Array<{ tweet_id: string }>; engagers: { replies: unknown[]; likes_by_tweet: Record<string, unknown[]> } };
        instagram: { content: Array<{ publication_id: string; engagers: { likes: unknown[]; comments: unknown[] } }> };
        linkedin: { content: Array<{ id: string; engagers: unknown; engagement_metrics: unknown }> };
      };
      unified: { summary: { all: { total_content: number; total_likes: number; total_comments: number; unique_engagers: number }; by_platform: { x: { total_content: number; total_likes: number; total_retweets: number; total_replies: number; total_quotes: number; total_bookmarks: number; total_views: number } } } };
    };

    expect(Object.keys(endpoints.endpoints).sort()).toEqual(["x:Favoriters", "x:UserTweets"]);
    expect(endpoints.endpoints["x:UserTweets"]?.count).toBe(1);
    expect(userTweetPayloads.payloads).toHaveLength(1);
    expect(allRaw.endpoints["x:Favoriters"]?.count).toBe(1);

    expect(exported.meta.profiles.x!.username).toBe("He4rtDevs");
    expect(exported.unified.summary.all.total_content).toBe(5);
    expect(exported.per_platform.x.content).toHaveLength(4);
    expect(exported.per_platform.x.engagers.replies).toHaveLength(1);
    expect(exported.unified.summary.all.total_likes).toBe(23);
    expect(exported.unified.summary.all.unique_engagers).toBe(3);
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

  test("captura publicações, comentários e curtidas do Instagram em export genérico", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T13:00:00.000Z",
      "instagram",
    );
    capture(
      app,
      "InstagramMedia",
      instagramSingleMediaPayload,
      "https://www.instagram.com/p/CAR789/",
      "2026-05-20T13:01:00.000Z",
      "instagram",
    );
    capture(
      app,
      "InstagramComments",
      instagramCommentsPayload,
      "https://www.instagram.com/p/ABC123/",
      "2026-05-20T13:02:00.000Z",
      "instagram",
    );
    capture(
      app,
      "InstagramLikers",
      instagramLikersPayload,
      "https://www.instagram.com/p/ABC123/liked_by/",
      "2026-05-20T13:03:00.000Z",
      "instagram",
    );

    const response = app.sendMessage({ action: "GET_PUBLICATIONS" }) as {
      commentsCount: number;
      engagementsCount: number;
      publications: Array<{
        provider: string;
        publication_id: string;
        shortcode?: string;
        type: string;
      }>;
    };
    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      meta: { profiles: Record<string, { username: string }> };
      per_platform: {
        instagram: {
          content: Array<{ provider: string; shortcode?: string; type: string; publication_id: string; engagers: { likes: unknown[]; comments: Array<{ comment_id: string }> } }>;
        };
        x: { content: unknown[] };
        linkedin: { content: unknown[] };
      };
      unified: {
        summary: {
          all: { total_content: number; total_likes: number; total_comments: number; unique_engagers: number };
          by_platform: { instagram: { total_content: number; total_comments: number; total_likes: number; total_views: number } };
        };
      };
    };

    expect(response.publications).toHaveLength(3);
    expect(response.publications.map((publication) => publication.shortcode).sort()).toEqual([
      "ABC123",
      "CAR789",
      "REEL456",
    ]);
    expect(
      response.publications.find((publication) => publication.shortcode === "REEL456")?.type,
    ).toBe("reel");
    expect(response.commentsCount).toBe(2);
    expect(response.engagementsCount).toBe(4);

    expect(exported.meta.profiles.instagram?.username).toBe("he4rtdevs");
    expect(exported.unified.summary.by_platform.instagram!.total_content).toBe(3);
    expect(exported.unified.summary.by_platform.instagram!.total_comments).toBe(2);

    const igPost = exported.per_platform.instagram.content.find((p) => p.shortcode === "ABC123");
    expect(igPost?.engagers.comments).toHaveLength(1);
    expect(igPost?.engagers.comments[0]?.replies).toHaveLength(1);
    expect(igPost?.engagers.comments[0]?.comment_id).toBe("comment-1");
  });

  test("ignora curtidas do Instagram fora do handle rastreado", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    app.sendMessage({
      action: "VISIBLE_PUBLICATIONS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/other_profile/",
      shortcodes: ["OUTSCOPE"],
      items: [
        {
          shortcode: "OUTSCOPE",
          url: "https://www.instagram.com/p/OUTSCOPE/",
          author: { username: "other_profile", name: "Other Profile" },
        },
      ],
    });
    capture(
      app,
      "InstagramLikers",
      instagramLikersPayload,
      "https://www.instagram.com/p/OUTSCOPE/liked_by/",
      "2026-05-20T13:04:00.000Z",
      "instagram",
    );

    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      unified: { summary: { all: { total_content: number; total_likes: number; total_comments: number; unique_engagers: number } } };
    };

    expect(exported.unified.summary.all.total_content).toBe(0);
    expect(exported.unified.summary.all.unique_engagers).toBe(0);
  });

  test("captura publicação principal renderizada por SSR e vincula comentários pelo shortcode", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(
      app,
      "InstagramPageSSR",
      instagramPostPagePayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-20T14:00:00.000Z",
      "instagram",
    );
    capture(
      app,
      "InstagramComments",
      instagramCommentsPayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-20T14:01:00.000Z",
      "instagram",
    );

    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      per_platform: {
        instagram: {
          content: Array<{ publication_id: string; shortcode?: string; engagers: { likes: unknown[]; comments: Array<{ comment_id: string }> } }>;
        };
      };
    };

    expect(
      exported.per_platform.instagram.content.find((publication) => publication.shortcode === "POSTSSR")
        ?.publication_id,
    ).toBe("394");
    const ssrPost = exported.per_platform.instagram.content.find((p) => p.shortcode === "POSTSSR");
    expect(ssrPost?.engagers.comments).toHaveLength(1);
    expect(ssrPost?.engagers.comments[0]?.replies).toHaveLength(1);
    expect(ssrPost?.engagers.comments[0]?.comment_id).toBe("comment-1");
  });

  test("preserva ordem de captura das publicações para refletir o scroll", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(
      app,
      "InstagramPageSSR",
      instagramPostPagePayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-20T15:00:00.000Z",
      "instagram",
    );
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-20T15:01:00.000Z",
      "instagram",
    );

    const response = app.sendMessage({ action: "GET_PUBLICATIONS" }) as {
      publications: Array<{ capture_order?: number; shortcode?: string }>;
    };

    expect(response.publications.map((publication) => publication.shortcode)).toEqual([
      "POSTSSR",
      "ABC123",
      "REEL456",
    ]);
    expect(response.publications.map((publication) => publication.capture_order)).toEqual([
      1, 2, 3,
    ]);
  });

  test("usa a ordem visível do Instagram quando o DOM informa shortcodes em outra ordem", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T15:30:00.000Z",
      "instagram",
    );
    app.sendMessage({
      action: "VISIBLE_PUBLICATIONS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
      shortcodes: ["REEL456", "ABC123"],
      items: [
        {
          author: { username: "he4rtdevs" },
          shortcode: "REEL456",
          url: "https://www.instagram.com/reel/REEL456/",
        },
        {
          author: { username: "he4rtdevs" },
          shortcode: "ABC123",
          url: "https://www.instagram.com/p/ABC123/",
        },
      ],
    });

    const response = app.sendMessage({ action: "GET_PUBLICATIONS" }) as {
      publications: Array<{ shortcode?: string; visible_order?: number }>;
    };

    expect(response.publications.map((publication) => publication.shortcode)).toEqual([
      "REEL456",
      "ABC123",
    ]);
    expect(response.publications.map((publication) => publication.visible_order)).toEqual([1, 2]);
  });

  test("cria publicações visíveis do Instagram antes do payload e depois enriquece pelo shortcode", () => {
    const app = createHarness();

    app.sendMessage({
      action: "VISIBLE_PUBLICATIONS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
      shortcodes: ["REEL456", "ABC123"],
      items: [
        {
          mediaType: "reel",
          shortcode: "REEL456",
          text: "Reel visível no DOM",
          url: "https://www.instagram.com/reel/REEL456/",
        },
        {
          mediaType: "image",
          shortcode: "ABC123",
          text: "Imagem visível no DOM",
          url: "https://www.instagram.com/p/ABC123/",
        },
      ],
    });

    const visibleOnly = app.sendMessage({ action: "GET_PUBLICATIONS" }) as {
      publications: Array<{
        is_placeholder?: boolean;
        publication_id: string;
        shortcode?: string;
        text: string;
        type: string;
        visible_order?: number;
      }>;
    };

    expect(visibleOnly.publications.map((publication) => publication.shortcode)).toEqual([
      "REEL456",
      "ABC123",
    ]);
    expect(visibleOnly.publications.every((publication) => publication.is_placeholder)).toBe(true);
    expect(visibleOnly.publications.map((publication) => publication.type)).toEqual([
      "reel",
      "image",
    ]);
    expect(visibleOnly.publications.map((publication) => publication.text)).toEqual([
      "Reel visível no DOM",
      "Imagem visível no DOM",
    ]);

    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T15:40:00.000Z",
      "instagram",
    );

    const enriched = app.sendMessage({ action: "GET_PUBLICATIONS" }) as {
      publications: Array<{
        is_placeholder?: boolean;
        publication_id: string;
        shortcode?: string;
        text: string;
        visible_order?: number;
      }>;
    };

    expect(enriched.publications.map((publication) => publication.shortcode)).toEqual([
      "REEL456",
      "ABC123",
    ]);
    expect(enriched.publications.map((publication) => publication.publication_id)).toEqual([
      "392",
      "391",
    ]);
    expect(enriched.publications.map((publication) => publication.visible_order)).toEqual([1, 2]);
    expect(enriched.publications.every((publication) => !publication.is_placeholder)).toBe(true);
    expect(enriched.publications[1]?.text).toContain("Laravel");
  });

  test("respeita o filtro de handle nas publicações visíveis e nos payloads do Instagram", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    app.sendMessage({
      action: "VISIBLE_PUBLICATIONS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
      shortcodes: ["ABC123", "OTHER999"],
      items: [
        {
          author: { username: "he4rtdevs" },
          shortcode: "ABC123",
          text: "Post da He4rt",
          url: "https://www.instagram.com/p/ABC123/",
        },
        {
          author: { username: "outro_usuario" },
          shortcode: "OTHER999",
          text: "Post de outro perfil",
          url: "https://www.instagram.com/p/OTHER999/",
        },
      ],
    });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T15:45:00.000Z",
      "instagram",
    );

    const response = app.sendMessage({ action: "GET_PUBLICATIONS", provider: "instagram" }) as {
      publications: Array<{ author: { username: string }; shortcode?: string }>;
    };

    expect(response.publications.map((publication) => publication.shortcode)).toEqual([
      "ABC123",
      "REEL456",
    ]);
    expect(
      response.publications.every(
        (publication) => publication.author.username.toLowerCase() === "he4rtdevs",
      ),
    ).toBe(true);
  });

  test("captura comentários visíveis do Instagram pelo DOM e exporta em comments_by_publication", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    app.sendMessage({
      action: "VISIBLE_PUBLICATIONS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/DY2ywueFXAj/",
      shortcodes: ["DY2ywueFXAj"],
      items: [
        {
          author: { username: "he4rtdevs" },
          shortcode: "DY2ywueFXAj",
          url: "https://www.instagram.com/p/DY2ywueFXAj/",
          mediaType: "carousel",
        },
      ],
    });
    app.sendMessage({
      action: "VISIBLE_COMMENTS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/DY2ywueFXAj/",
      publication_shortcode: "DY2ywueFXAj",
      captured_at: "2026-05-28T10:00:00.000Z",
      comments: [
        {
          comment_id: "18199045243364553",
          publication_shortcode: "DY2ywueFXAj",
          author: {
            username: "teamfighttacticsbrasil",
            name: "teamfighttacticsbrasil",
          },
          text: "look do dia pra ser top 1 😎❤️",
          like_count: 2,
          parent_comment_id: null,
          relative_created_at: "3h",
          source: "Instagram DOM",
        },
      ],
    });
    app.sendMessage({
      action: "VISIBLE_COMMENTS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/DY2ywueFXAj/",
      publication_shortcode: "DY2ywueFXAj",
      captured_at: "2026-05-28T10:01:00.000Z",
      comments: [
        {
          comment_id: "18199045243364553",
          publication_shortcode: "DY2ywueFXAj",
          author: {
            username: "teamfighttacticsbrasil",
            name: "teamfighttacticsbrasil",
          },
          text: "look do dia pra ser top 1 😎❤️",
          like_count: 2,
          parent_comment_id: null,
          relative_created_at: "3h",
          source: "Instagram DOM",
        },
        {
          comment_id: "17864617854572288",
          publication_shortcode: "DY2ywueFXAj",
          author: {
            username: "viqsm",
            name: "viqsm",
          },
          text: "@teamfighttacticsbrasil o top1 hoje tem nome e sobrenome 🤝",
          like_count: 0,
          parent_comment_id: "18199045243364553",
          relative_created_at: "3h",
          source: "Instagram DOM",
        },
      ],
    });

    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      per_platform: {
        instagram: {
          content: Array<{
            shortcode?: string;
            publication_id: string;
            engagers: {
              likes: unknown[];
              comments: Array<{
                comment_id: string;
                text: string;
                like_count?: number;
                replies: Array<{ comment_id: string; text: string; parent_comment_id?: string }>;
              }>;
            };
          }>;
        };
      };
      unified: { summary: { all: { total_content: number; total_likes: number; total_comments: number; unique_engagers: number }; by_platform: { instagram: { total_content: number; total_comments: number; total_likes: number; total_views: number } } } };
    };
    const igPost = exported.per_platform.instagram.content.find((p) => p.shortcode === "DY2ywueFXAj");
    const comments = igPost?.engagers.comments || [];

    expect(comments).toHaveLength(1);
    expect(comments?.[0]).toMatchObject({
      comment_id: "18199045243364553",
      text: "look do dia pra ser top 1 😎❤️",
      like_count: 2,
    });
    expect(comments?.[0]?.replies).toHaveLength(1);
    expect(comments?.[0]?.replies[0]).toMatchObject({
      comment_id: "17864617854572288",
      text: "@teamfighttacticsbrasil o top1 hoje tem nome e sobrenome 🤝",
    });
    expect(exported.unified.summary.all.total_comments).toBe(2);
    expect(exported.unified.summary.by_platform.instagram!.total_comments).toBe(2);
    const raw = app.sendMessage({ action: "GET_RAW_PAYLOADS", provider: "instagram" }) as {
      endpoints: Record<string, { count: number }>;
    };
    expect(raw.endpoints["instagram:InstagramDomComments"]?.count).toBe(2);
  });

  test("normaliza respostas de comentários vindas de child_comments do Instagram", () => {
    const app = createHarness();

    capture(
      app,
      "InstagramPageSSR",
      instagramPostPagePayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-28T11:00:00.000Z",
      "instagram",
    );
    capture(
      app,
      "InstagramComments",
      instagramChildCommentsPayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-28T11:01:00.000Z",
      "instagram",
    );

    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      per_platform: {
        instagram: {
          content: Array<{
            shortcode?: string;
            publication_id: string;
            engagers: { likes: unknown[]; comments: Array<{ comment_id: string; text: string; replies: Array<{ comment_id: string; text: string }> }> };
          }>;
        };
      };
      unified: {
        summary: {
          all: { total_content: number; total_likes: number; total_comments: number; unique_engagers: number };
          by_platform: { instagram: { total_content: number; total_comments: number; total_likes: number; total_views: number } };
        };
      };
    };
    const igPost = exported.per_platform.instagram.content.find((p) => p.publication_id === "394");
    const comments = igPost?.engagers.comments || [];

    expect(comments).toHaveLength(1);
    expect(comments?.[0]).toMatchObject({
      comment_id: "17864617854572288",
      text: "@teamfighttacticsbrasil o top1 hoje tem nome e sobrenome 🤝",
    });
    expect(comments?.[0]?.replies).toHaveLength(0);
    expect(exported.unified.summary.all.total_comments).toBe(1);
    expect(exported.unified.summary.by_platform.instagram!.total_comments).toBe(1);
  });

  test("migra comentários DOM visíveis quando o payload real resolve o shortcode do Instagram", () => {
    const app = createHarness();

    app.sendMessage({
      action: "VISIBLE_COMMENTS",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/POSTSSR/",
      publication_shortcode: "POSTSSR",
      captured_at: "2026-05-28T10:05:00.000Z",
      comments: [
        {
          comment_id: "dom-comment-1",
          publication_shortcode: "POSTSSR",
          author: { username: "community_user" },
          text: "comentário antes do payload",
          like_count: 1,
        },
      ],
    });

    type ExportResult = {
      per_platform: {
        instagram: {
          content: Array<{
            shortcode?: string;
            publication_id: string;
            engagers: { likes: unknown[]; comments: Array<{ comment_id: string }> };
          }>;
        };
      };
    };

    const getCommentsForShortcode = (result: ExportResult, sc: string) =>
      result.per_platform.instagram.content.find((p) => p.shortcode === sc)?.engagers.comments;

    // Before SSR capture: no publication exists, so content is empty
    const resultBefore = app.sendMessage({ action: "GET_EXPORT" }) as ExportResult;
    expect(resultBefore.per_platform.instagram.content).toHaveLength(0);

    capture(
      app,
      "InstagramPageSSR",
      instagramPostPagePayload,
      "https://www.instagram.com/p/POSTSSR/",
      "2026-05-28T10:06:00.000Z",
      "instagram",
    );

    const exported = app.sendMessage({ action: "GET_EXPORT" }) as {
      per_platform: {
        instagram: {
          content: Array<{
            shortcode?: string;
            publication_id: string;
            engagers: { likes: unknown[]; comments: Array<{ comment_id: string }> };
          }>;
        };
      };
      unified: { summary: { all: { total_content: number; total_likes: number; total_comments: number; unique_engagers: number } } };
    };

    // After SSR: publication created, DOM comments migrated
    const migratedComments = getCommentsForShortcode(exported, "POSTSSR");
    expect(migratedComments).toHaveLength(1);
    expect(migratedComments?.[0]?.comment_id).toBe("dom-comment-1");
  });

  test("mantém dados capturados ao iniciar nova sessão do mesmo provider", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T16:00:00.000Z",
      "instagram",
    );

    expect(
      (app.sendMessage({ action: "GET_PUBLICATIONS" }) as { publications: unknown[] }).publications,
    ).toHaveLength(2);

    app.sendMessage({
      action: "PAGE_SESSION_STARTED",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/NEWPAGE/",
      sessionKey: "session-2",
    });

    expect(app.sendMessage({ action: "GET_HANDLE" })).toEqual({ handle: "he4rtdevs" });
    expect(
      (app.sendMessage({ action: "GET_PUBLICATIONS" }) as { publications: unknown[] }).publications,
    ).toHaveLength(2);
    expect(
      (app.sendMessage({ action: "GET_ENDPOINTS" }) as { endpoints: Record<string, unknown> })
        .endpoints,
    ).toHaveProperty("instagram:InstagramFeedTimeline");
  });

  test("alterna provider ativo pelo popup mantendo dados entre contextos", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    app.sendMessage({
      action: "SET_ACTIVE_PROVIDER",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
    });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T17:00:00.000Z",
      "instagram",
    );

    expect(
      (
        app.sendMessage({ action: "GET_PUBLICATIONS", provider: "instagram" }) as {
          publications: unknown[];
        }
      ).publications,
    ).toHaveLength(2);

    app.sendMessage({
      action: "SET_ACTIVE_PROVIDER",
      provider: "x",
      pageUrl: "https://x.com/He4rtDevs",
    });
    capture(
      app,
      "UserTweets",
      userTweetsPayload,
      "https://x.com/He4rtDevs",
      "2026-05-20T17:01:00.000Z",
      "x",
    );

    expect(app.sendMessage({ action: "GET_HANDLE" })).toEqual({ handle: "he4rtdevs" });
    expect(
      (
        app.sendMessage({ action: "GET_PUBLICATIONS", provider: "x" }) as {
          publications: unknown[];
        }
      ).publications,
    ).toHaveLength(5);
    expect(
      (
        app.sendMessage({ action: "GET_ENDPOINTS", provider: "x" }) as {
          endpoints: Record<string, unknown>;
        }
      ).endpoints,
    ).toHaveProperty("x:UserTweets");

    app.sendMessage({
      action: "SET_ACTIVE_PROVIDER",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
    });

    expect(
      (
        app.sendMessage({ action: "GET_PUBLICATIONS", provider: "instagram" }) as {
          publications: unknown[];
        }
      ).publications,
    ).toHaveLength(2);
  });

  test("não limpa dados quando o popup abre sem detectar provider", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    app.sendMessage({
      action: "SET_ACTIVE_PROVIDER",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/",
    });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T17:30:00.000Z",
      "instagram",
    );

    app.sendMessage({
      action: "SET_ACTIVE_PROVIDER",
      provider: null,
      pageUrl: "chrome-extension://popup.html",
    });

    expect(
      (
        app.sendMessage({ action: "GET_PUBLICATIONS", provider: "instagram" }) as {
          publications: unknown[];
        }
      ).publications,
    ).toHaveLength(2);
  });

  test("recarregar uma página mantém dados entre contextos", () => {
    const app = createHarness();

    app.sendMessage({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(
      app,
      "InstagramFeedTimeline",
      instagramFeedPayload,
      "https://www.instagram.com/",
      "2026-05-20T18:00:00.000Z",
      "instagram",
    );
    capture(
      app,
      "UserTweets",
      userTweetsPayload,
      "https://x.com/He4rtDevs",
      "2026-05-20T18:01:00.000Z",
      "x",
    );

    app.sendMessage({
      action: "PAGE_SESSION_STARTED",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/NEWPAGE/",
      sessionKey: "instagram-session-2",
    });

    expect(
      (
        app.sendMessage({ action: "GET_PUBLICATIONS", provider: "instagram" }) as {
          publications: unknown[];
        }
      ).publications,
    ).toHaveLength(2);
    expect(
      (
        app.sendMessage({ action: "GET_PUBLICATIONS", provider: "x" }) as {
          publications: unknown[];
        }
      ).publications,
    ).toHaveLength(5);
  });
});
