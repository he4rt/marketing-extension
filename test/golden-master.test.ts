import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import type { RuntimeMessage } from "../src/shared/messages";
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
});
