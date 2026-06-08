import { describe, expect, test } from "bun:test";
import { createStore } from "../../src/background/controller";
import { devtoProvider } from "../../src/providers/devto";
import { articleIdFromUrl, parseAnalytics, parseReactions } from "../../src/providers/devto/parser";
import { publicationKey } from "../../src/providers/shared/utils";
import type { DevToStore } from "../../src/shared/domain";

const ARTICLE_ID = "123456";
const ANALYTICS_URL = `https://dev.to/api/analytics/dashboard?article_id=${ARTICLE_ID}&start=2023-01-01`;
const REACTIONS_URL = `https://dev.to/reactions?article_id=${ARTICLE_ID}`;

const rawAnalytics = {
  totals: {
    comments: { total: 0 },
    follows: { total: 1 },
    reactions: {
      total: 1,
      like: 0,
      readinglist: 0,
      unicorn: 1,
      exploding_head: 0,
      raised_hands: 0,
      fire: 0,
      unique_reactors: 1,
    },
    page_views: { total: 0, average_read_time_in_seconds: 0, total_read_time_in_seconds: 0 },
  },
  historical: { "2026-06-03": { reactions: { total: 1 } } },
  follower_engagement: { total_followers: 1, engaged_followers: 0, ratio: 0 },
  referrers: { domains: [] },
};

const rawReactions = {
  current_user: { id: 894593 },
  reactions: [
    {
      id: 20700191,
      user_id: 894593,
      category: "unicorn",
      created_at: "2026-06-03T14:39:00.092Z",
    },
  ],
  article_reaction_counts: [
    { category: "like", count: 0 },
    { category: "unicorn", count: 1 },
  ],
};

describe("parseAnalytics", () => {
  test("mapeia payload completo para DevToArticleAnalytics", () => {
    const result = parseAnalytics(ARTICLE_ID, rawAnalytics);
    expect(result).not.toBeNull();
    expect(result?.article_id).toBe(ARTICLE_ID);
    expect(result?.totals.follows.total).toBe(1);
    expect(result?.totals.reactions.total).toBe(1);
    expect(result?.totals.reactions.unicorn).toBe(1);
    expect(result?.totals.page_views.total).toBe(0);
    expect(result?.historical).toEqual({ "2026-06-03": { reactions: { total: 1 } } });
    expect(result?.follower_engagement?.total_followers).toBe(1);
  });

  test("retorna null se payload não tem totals", () => {
    expect(parseAnalytics(ARTICLE_ID, {})).toBeNull();
    expect(parseAnalytics(ARTICLE_ID, null)).toBeNull();
  });

  test("preenche zeros para campos ausentes em totals", () => {
    const result = parseAnalytics(ARTICLE_ID, { totals: {} });
    expect(result?.totals.page_views.total).toBe(0);
    expect(result?.totals.reactions.total).toBe(0);
    expect(result?.totals.follows.total).toBe(0);
  });
});

describe("parseReactions", () => {
  test("mapeia reactions para SocialEngagement[] usando user_id", () => {
    const engagements = parseReactions(ARTICLE_ID, rawReactions, "2026-06-06T00:00:00Z");
    expect(engagements).toHaveLength(1);

    const first = engagements[0];
    expect(first?.engagement_id).toBe("20700191");
    expect(first?.publication_id).toBe(ARTICLE_ID);
    expect(first?.provider).toBe("devto");
    expect(first?.kind).toBe("like");
    expect(first?.actor.provider_user_id).toBe("894593");
    expect(first?.actor.username).toBe("894593");
    expect(first?.engaged_at).toBe("2026-06-03T14:39:00.092Z");
    expect(first?.captured_at).toBe("2026-06-06T00:00:00Z");
  });

  test("ignora reactions sem id ou sem user_id", () => {
    const payload = {
      reactions: [{ id: 1 }, { user_id: 42 }, { id: 3, user_id: 99 }],
    };
    const result = parseReactions(ARTICLE_ID, payload, "");
    expect(result).toHaveLength(1);
    expect(result[0]?.engagement_id).toBe("3");
  });

  test("retorna [] se payload não tem reactions", () => {
    expect(parseReactions(ARTICLE_ID, {}, "")).toEqual([]);
    expect(parseReactions(ARTICLE_ID, null, "")).toEqual([]);
  });
});

describe("articleIdFromUrl", () => {
  test("extrai article_id de URL de analytics", () => {
    expect(articleIdFromUrl(ANALYTICS_URL)).toBe(ARTICLE_ID);
  });

  test("extrai article_id de URL de reactions", () => {
    expect(articleIdFromUrl(REACTIONS_URL)).toBe(ARTICLE_ID);
  });

  test("retorna null para URL inválida", () => {
    expect(articleIdFromUrl("not-a-url")).toBeNull();
  });
});

describe("devtoProvider.processCapture", () => {
  function makeCapture(endpoint: string, payload: unknown, url: string) {
    return {
      action: "CAPTURED_PAYLOAD" as const,
      provider: "devto" as const,
      endpoint,
      payload,
      url,
      pageUrl: "https://dev.to",
      timestamp: "2026-06-06T00:00:00Z",
    };
  }

  test("analytics: armazena em extra.analytics", () => {
    const store = createStore();
    devtoProvider.processCapture(store, makeCapture("analytics", rawAnalytics, ANALYTICS_URL));
    const devto = store.platforms.devto as DevToStore;
    expect(devto.extra.analytics[ARTICLE_ID]).toBeDefined();
    expect(devto.extra.analytics[ARTICLE_ID]?.totals.reactions.unicorn).toBe(1);
  });

  test("reactions: armazena em engagementsByPublication", () => {
    const store = createStore();
    devtoProvider.processCapture(store, makeCapture("reactions", rawReactions, REACTIONS_URL));
    const devto = store.platforms.devto as DevToStore;
    const key = publicationKey("devto", ARTICLE_ID);
    expect(devto.engagementsByPublication[key]).toHaveLength(1);
    expect(devto.engagementsByPublication[key]?.[0]?.actor.provider_user_id).toBe("894593");
  });

  test("reactions: substitui lista ao re-processar (snapshot completo)", () => {
    const store = createStore();
    const single = { reactions: [{ id: 1, user_id: 1 }] };
    devtoProvider.processCapture(store, makeCapture("reactions", rawReactions, REACTIONS_URL));
    devtoProvider.processCapture(store, makeCapture("reactions", single, REACTIONS_URL));
    const key = publicationKey("devto", ARTICLE_ID);
    expect(store.platforms.devto.engagementsByPublication[key]).toHaveLength(1);
  });

  test("ignora capture sem url", () => {
    const store = createStore();
    devtoProvider.processCapture(store, {
      action: "CAPTURED_PAYLOAD",
      provider: "devto",
      endpoint: "analytics",
      payload: rawAnalytics,
      pageUrl: "https://dev.to",
      timestamp: "2026-06-06T00:00:00Z",
    });
    const devto = store.platforms.devto as DevToStore;
    expect(Object.keys(devto.extra.analytics)).toHaveLength(0);
  });

  test("ignora endpoint desconhecido", () => {
    const store = createStore();
    devtoProvider.processCapture(
      store,
      makeCapture("unknown_endpoint", rawAnalytics, ANALYTICS_URL),
    );
    const devto = store.platforms.devto as DevToStore;
    expect(Object.keys(devto.extra.analytics)).toHaveLength(0);
  });
});
