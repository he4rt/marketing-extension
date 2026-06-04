import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runActiveFetch } from "../../../../src/background/active-fetch";
import { createStore } from "../../../../src/background/controller";
import { recordProvenance, storePublication } from "../../../../src/background/store";
import { buildPlatformDataLinkedin } from "../../../../src/providers/linkedin";
import {
  getCalibration,
  harvestSignature,
  resetCalibration,
} from "../../../../src/providers/linkedin/active-fetch/calibration";
import type {
  BackgroundStore,
  LinkedInPostData,
  SocialPublication,
} from "../../../../src/shared/domain";
import {
  linkedinCommentsPayload,
  linkedinReactionsPayload,
  linkedinRepostsPayload,
} from "../../../fixtures/linkedin-payloads";

// Teste de INTEGRAÇÃO do fan-out do scheduler (#17): prova que o Active Fetch (L3)
// dispara os 3 endpoints Voyager — reactions + os DOIS novos (socialDashComments,
// feedDashReshareFeed) — SEQUENCIALMENTE através do MESMO processCapture, consolidando
// comentaristas/texto e reposts com Provenance "search", e que a riqueza do LinkedIn
// (engagement_metrics / reaction_breakdown) NÃO se perde do export v3.
//
// O fetch real é substituído por um stub que roteia cada URL Voyager (pelo prefixo do
// queryId colhido) para a fixture correta. Sem rede; o delay do scheduler é real mas
// pequeno (1 alvo × 3 endpoints = 2 esperas) — toleramos no timeout do teste.

const ACTIVITY_URN = "urn:li:activity:111";

// Assinaturas Voyager passivas: harvestSignature cacheia os queryId de cada endpoint.
const REACTIONS_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashReactions.aaa&variables=(x)";
const COMMENTS_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashComments.bbb&variables=(x)";
const RESHARE_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerFeedDashReshareFeed.ccc&variables=(x)";

function zeroMetrics() {
  return {
    bookmark_count: 0,
    comment_count: 12,
    like_count: 207,
    quote_count: 0,
    reply_count: 0,
    repost_count: 5,
    retweet_count: 0,
    save_count: 0,
    view_count: 0,
  };
}

// Post "descoberto na busca": share_urn vazio, activity_urn populado, Provenance "search".
// Espelha exatamente o que search/process.ts (publicationToPostData) grava no store.
function seedSearchPost(store: BackgroundStore): void {
  const pub: SocialPublication = {
    provider: "linkedin",
    publication_id: ACTIVITY_URN,
    type: "original",
    author: {
      provider: "linkedin",
      provider_user_id: "urn:li:company:123",
      username: "he4rt_developers",
      name: "He4rt Developers",
      avatar_url: "",
    },
    text: "Laravel Day SP",
    created_at: "",
    metrics: zeroMetrics(),
    hashtags: [],
    media_count: 0,
    url: "",
    urls: [],
    user_mentions: [],
    source: "search_sdui",
  };
  storePublication(store, pub);

  const post: LinkedInPostData = {
    id: ACTIVITY_URN,
    activity_urn: ACTIVITY_URN,
    share_urn: "",
    text: "Laravel Day SP",
    type: "original",
    author: {
      urn: "urn:li:company:123",
      name: "He4rt Developers",
      headline: "",
      avatar_url: "",
      vanity_name: "he4rt_developers",
    },
    metrics: {
      like_count: 207,
      comment_count: 12,
      share_count: 5,
      total_reactions: 207,
      reaction_breakdown: { LIKE: 155, PRAISE: 26, EMPATHY: 26 },
    },
    hashtags: [],
    media: [],
    created_at: "",
    timestamp_text: "",
    source: "search_sdui",
  };
  const lstore = store.platforms.linkedin.extra;
  lstore.posts[post.id] = post;
  lstore.feedOrder.push(post.id);

  recordProvenance(store, "linkedin", ACTIVITY_URN, "search", "Laravel Day SP");
}

// Roteia a URL do request (pelo queryId colhido) para a fixture correta. Devolve um
// Response-like mínimo: { status, json() } — o scheduler só lê status + json().
function routeFixture(url: string): { status: number; json: () => Promise<unknown> } {
  const ok = (payload: unknown) => ({ status: 200, json: async () => payload });
  if (url.includes("voyagerSocialDashReactions")) return ok(linkedinReactionsPayload);
  if (url.includes("voyagerSocialDashComments")) return ok(linkedinCommentsPayload);
  if (url.includes("voyagerFeedDashReshareFeed")) return ok(linkedinRepostsPayload);
  return { status: 404, json: async () => ({}) };
}

describe("Active Fetch fan-out (scheduler L3: reactions + comments + reposts)", () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  beforeEach(() => {
    resetCalibration();
    seenUrls.length = 0;
    // Calibra os 3 endpoints + csrf (sem ele buildVoyagerRequest devolve null).
    harvestSignature(REACTIONS_URL, { "csrf-token": "ajax:sess" });
    harvestSignature(COMMENTS_URL);
    harvestSignature(RESHARE_URL);
    // Stub de fetch: registra a URL e devolve a fixture roteada.
    (globalThis as { fetch: unknown }).fetch = async (input: Request | string) => {
      const url = typeof input === "string" ? input : input.url;
      seenUrls.push(url);
      return routeFixture(url) as unknown as Response;
    };
  });

  afterEach(() => {
    (globalThis as { fetch: unknown }).fetch = originalFetch;
  });

  test("dispara os 3 endpoints sequencialmente para o alvo descoberto", async () => {
    const store = createStore("");
    seedSearchPost(store);

    const status = await runActiveFetch(store, "linkedin");

    expect(status.running).toBe(false);
    expect(status.error).toBeUndefined();
    expect(status.total).toBe(3); // 1 alvo × 3 endpoints calibrados
    expect(status.done).toBe(3);
    // Ordem do fan-out: reactions → comments → reposts.
    expect(seenUrls.map((u) => new URL(u).searchParams.get("queryId"))).toEqual([
      "voyagerSocialDashReactions.aaa",
      "voyagerSocialDashComments.bbb",
      "voyagerFeedDashReshareFeed.ccc",
    ]);
  }, 15000);

  test("comments (comentaristas + texto) entram no store via processCapture", async () => {
    const store = createStore("");
    seedSearchPost(store);
    await runActiveFetch(store, "linkedin");

    const lstore = store.platforms.linkedin.extra;
    const commentEntry = lstore.comments[ACTIVITY_URN];
    expect(commentEntry).toBeDefined();
    expect(commentEntry?.items.length).toBeGreaterThan(0);
    const root = commentEntry?.items.find((c) => c.comment_id === "urn:li:fsd_comment:c1");
    expect(root?.author.name).toBe("Commenter One");
    expect(root?.text).toBe("Otimo conteudo, obrigado!");
  }, 15000);

  test("reposts entram no store via processCapture", async () => {
    const store = createStore("");
    seedSearchPost(store);
    await runActiveFetch(store, "linkedin");

    const repostEntry = store.platforms.linkedin.extra.reposts[ACTIVITY_URN];
    expect(repostEntry).toBeDefined();
    expect(repostEntry?.users.some((u) => (u.name || "").includes("Reposter"))).toBe(true);
  }, 15000);

  test("a riqueza do LinkedIn (engagement_metrics) e a Provenance search sobrevivem no export", async () => {
    const store = createStore("");
    seedSearchPost(store);
    await runActiveFetch(store, "linkedin");

    const platform = buildPlatformDataLinkedin(store);
    const item = platform.content.find((p) => p.activity_urn === ACTIVITY_URN);
    expect(item).toBeDefined();

    // reaction_breakdown do post não se perde.
    expect(item?.metrics.reaction_breakdown).toEqual({ LIKE: 155, PRAISE: 26, EMPATHY: 26 });

    // Comentários e reposts capturados pelo fan-out aparecem nos engagers.
    expect(item?.engagers.comments.length).toBeGreaterThan(0);
    expect(item?.engagers.reactions.length).toBeGreaterThan(0);
    expect(item?.engagers.reposts.length).toBeGreaterThan(0);

    // engagement_metrics agregado preservado (comentaristas + reagentes únicos).
    expect(item?.engagement_metrics.unique_commenters_count).toBeGreaterThan(0);
    expect(item?.engagement_metrics.unique_reacters_count).toBeGreaterThan(0);

    // Provenance da busca carimbada no item do export v3.
    expect(item?.provenance).toEqual({ mode: "search", value: "Laravel Day SP" });
  }, 15000);

  test("não calibrado (sem csrf) → nenhum request e status uncalibrated", async () => {
    resetCalibration();
    harvestSignature(REACTIONS_URL); // queryId sem csrf → buildRequest devolve null
    expect(getCalibration().csrfToken).toBeNull();

    const store = createStore("");
    seedSearchPost(store);
    const status = await runActiveFetch(store, "linkedin");

    expect(seenUrls).toHaveLength(0);
    expect(status.error).toBe("uncalibrated");
  }, 15000);
});
