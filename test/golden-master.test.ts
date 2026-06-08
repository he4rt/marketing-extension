import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import type { RuntimeMessage } from "../src/shared/messages";
import {
  devtoAnalyticsPayload,
  devtoAnalyticsUrl,
  devtoReactionsPayload,
  devtoReactionsUrl,
} from "./fixtures/devto-payloads";
import {
  instagramCommentsPayload,
  instagramFeedPayload,
  instagramLikersPayload,
  instagramSingleMediaPayload,
} from "./fixtures/instagram-payloads";
import {
  linkedinCommentsPayload,
  linkedinCommentsUrl,
  linkedinFeedPayload,
  linkedinReactionsPayload,
  linkedinReactionsUrl,
  linkedinRepostsPayload,
  linkedinRepostsUrl,
} from "./fixtures/linkedin-payloads";
import {
  favoritersPayload,
  userByScreenNamePayload,
  userTweetsPayload,
} from "./fixtures/twitter-payloads";

// Golden-master do export v3. Congela o GET_EXPORT contra o código atual, normalizando
// apenas os campos voláteis (timestamps gerados via Date.now()). Qualquer mudança
// estrutural ou de valor no v3 falha em vermelho durante a reestruturação dos providers.

const TS = "2026-05-20T12:00:00.000Z";

// Stream React-Flight da busca SDUI (mini-fixture fiel: 2 posts bem-formados, 0 ilegíveis).
// Captura `searchResultsContent` chega como STRING — espelha o que o interceptor posta com
// responseFormat:"text". Reusa a mesma fixture do unit do parser para manter um só oráculo.
const linkedinSearchSduiPayload = readFileSync(
  join(import.meta.dir, "fixtures", "linkedin-search-sdui.min.txt"),
  "utf8",
);

function harness() {
  const store = createStore();
  const send = (request: RuntimeMessage): unknown =>
    JSON.parse(JSON.stringify(handleRuntimeMessage(store, request, {})));
  return { send, store };
}

type Cap = {
  provider: "instagram" | "linkedin" | "x";
  endpoint: string;
  payload: unknown;
  pageUrl: string;
  url?: string;
};

function capture(send: (r: RuntimeMessage) => unknown, c: Cap) {
  return send({
    action: "CAPTURED_PAYLOAD",
    provider: c.provider,
    endpoint: c.endpoint,
    payload: c.payload,
    pageUrl: c.pageUrl,
    url: c.url,
    timestamp: TS,
  });
}

const VOLATILE = new Set(["exported_at", "captured_at", "lastUpdated", "last_updated", "lastSeen"]);

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = VOLATILE.has(key) ? "<ts>" : normalize(val);
    }
    return out;
  }
  return value;
}

function exportOf(send: (r: RuntimeMessage) => unknown) {
  return normalize(send({ action: "GET_EXPORT" }));
}

describe("golden-master export v3", () => {
  test("X", () => {
    const { send } = harness();
    send({ action: "SET_HANDLE", handle: "He4rtDevs" });
    capture(send, {
      provider: "x",
      endpoint: "UserByScreenName",
      payload: userByScreenNamePayload,
      pageUrl: "https://x.com/He4rtDevs",
    });
    capture(send, {
      provider: "x",
      endpoint: "UserTweets",
      payload: userTweetsPayload,
      pageUrl: "https://x.com/He4rtDevs",
    });
    capture(send, {
      provider: "x",
      endpoint: "Favoriters",
      payload: favoritersPayload,
      pageUrl: "https://x.com/He4rtDevs/status/100/likes",
    });

    expect(exportOf(send)).toMatchSnapshot();
  });

  test("Instagram", () => {
    const { send } = harness();
    send({ action: "SET_HANDLE", handle: "he4rtdevs" });
    capture(send, {
      provider: "instagram",
      endpoint: "InstagramFeedTimeline",
      payload: instagramFeedPayload,
      pageUrl: "https://www.instagram.com/",
    });
    capture(send, {
      provider: "instagram",
      endpoint: "InstagramMedia",
      payload: instagramSingleMediaPayload,
      pageUrl: "https://www.instagram.com/p/CAR789/",
    });
    capture(send, {
      provider: "instagram",
      endpoint: "InstagramComments",
      payload: instagramCommentsPayload,
      pageUrl: "https://www.instagram.com/p/ABC123/",
    });
    capture(send, {
      provider: "instagram",
      endpoint: "InstagramLikers",
      payload: instagramLikersPayload,
      pageUrl: "https://www.instagram.com/p/ABC123/liked_by/",
    });

    expect(exportOf(send)).toMatchSnapshot();
  });

  test("LinkedIn", () => {
    const { send } = harness();
    send({ action: "SET_HANDLE", handle: "He4rt Developers", provider: "linkedin" });
    capture(send, {
      provider: "linkedin",
      endpoint: "feedDashOrganizationalPageUpdates",
      payload: linkedinFeedPayload,
      pageUrl: "https://www.linkedin.com/company/he4rt/",
    });
    capture(send, {
      provider: "linkedin",
      endpoint: "socialDashReactions",
      payload: linkedinReactionsPayload,
      pageUrl: "https://www.linkedin.com/company/he4rt/",
      url: linkedinReactionsUrl,
    });
    capture(send, {
      provider: "linkedin",
      endpoint: "socialDashComments",
      payload: linkedinCommentsPayload,
      pageUrl: "https://www.linkedin.com/company/he4rt/",
      url: linkedinCommentsUrl,
    });
    capture(send, {
      provider: "linkedin",
      endpoint: "feedDashReshareFeed",
      payload: linkedinRepostsPayload,
      pageUrl: "https://www.linkedin.com/company/he4rt/",
      url: linkedinRepostsUrl,
    });

    expect(exportOf(send)).toMatchSnapshot();
  });

  // Cenário NOVO (#14): descoberta SDUI da busca. Monta um store só com a captura
  // `searchResultsContent` (payload STRING Flight) e snapshota o export. Cada item de
  // per_platform.linkedin.content[] deve carregar provenance {mode:"search", value}.
  // Snapshot NOVO — gerado na 1a execução (toMatchSnapshot), sem -u; os 3 v3 atuais
  // permanecem byte-idênticos (search é aditivo e profile-puro não grava provenance search).
  test("LinkedIn (search)", () => {
    const { send } = harness();
    send({ action: "SET_HANDLE", handle: "", provider: "linkedin" });
    capture(send, {
      provider: "linkedin",
      endpoint: "searchResultsContent",
      payload: linkedinSearchSduiPayload,
      pageUrl: "https://www.linkedin.com/search/results/content/?keywords=Laravel+Day+SP",
    });

    expect(exportOf(send)).toMatchSnapshot();
  });

  // Cenário NOVO: provider dev.to (Background-only). Simula um Active Fetch bem-sucedido:
  // analytics + reactions de um artigo. Snapshot NOVO — gerado na 1a execução; snapshots
  // existentes (x/instagram/linkedin) permanecem byte-idênticos (devto é aditivo: só aparece
  // em per_platform/by_platform quando há dados; all.* contribui 0 em stores vazios).
  test("dev.to", () => {
    const { send } = harness();
    send({ action: "SET_HANDLE", handle: "erikmazzelli", provider: "devto" });
    send({
      action: "CAPTURED_PAYLOAD",
      provider: "devto",
      endpoint: "analytics",
      payload: devtoAnalyticsPayload,
      url: devtoAnalyticsUrl,
      pageUrl: "https://dev.to/dashboard",
      timestamp: TS,
    });
    send({
      action: "CAPTURED_PAYLOAD",
      provider: "devto",
      endpoint: "reactions",
      payload: devtoReactionsPayload,
      url: devtoReactionsUrl,
      pageUrl: "https://dev.to/dashboard",
      timestamp: TS,
    });

    expect(exportOf(send)).toMatchSnapshot();
  });
});
