import { describe, expect, test } from "bun:test";
import { runActiveFetch } from "../src/background/active-fetch-scheduler";
import type {
  ActiveFetchRequest,
  ActiveFetchStrategy,
  EnumeratedTarget,
} from "../src/providers/devto/active-fetch";

function makeTarget(id: string): EnumeratedTarget {
  return { id };
}

function defaultRequests(target: EnumeratedTarget): ActiveFetchRequest[] {
  return [
    {
      endpoint: "analytics",
      url: `https://dev.to/api/analytics/historical?article_id=${target.id}`,
      auth: "api-key",
      afkSafe: true,
    },
    {
      endpoint: "reactions",
      url: `https://dev.to/api/reactions?article_id=${target.id}`,
      auth: "cookie",
      afkSafe: false,
    },
  ];
}

function stubStrategy(
  targets: EnumeratedTarget[],
  requestsFor: (t: EnumeratedTarget) => ActiveFetchRequest[] = defaultRequests,
): ActiveFetchStrategy {
  return {
    kind: "activeFetch",
    async enumerate({ apiKey }) {
      return apiKey ? targets : [];
    },
    requestsFor,
  };
}

type FetchFn = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function okFetch(body: unknown = {}): FetchFn {
  return async (_url, _init) => new Response(JSON.stringify(body), { status: 200 });
}

describe("active-fetch-scheduler", () => {
  test("a) onDemand: dispara analytics+reactions para cada alvo", async () => {
    const targets = [makeTarget("1"), makeTarget("2")];
    const captured: { endpoint: string; payload: unknown }[] = [];

    const status = await runActiveFetch({
      strategy: stubStrategy(targets),
      apiKey: "key",
      mode: "onDemand",
      fetchFn: okFetch({ ok: true }),
      onCapture: (endpoint, payload) => captured.push({ endpoint, payload }),
      delayMs: 0,
    });

    expect(status.articles).toBe(2);
    expect(status.collected).toBe(4);
    expect(status.reactions).toBe(2);
    expect(captured).toHaveLength(4);
    expect(captured.filter((c) => c.endpoint === "analytics")).toHaveLength(2);
    expect(captured.filter((c) => c.endpoint === "reactions")).toHaveLength(2);
  });

  test("b) afk: só requests afkSafe:true (analytics); reactions ignoradas", async () => {
    const targets = [makeTarget("1"), makeTarget("2")];
    const captured: string[] = [];

    const status = await runActiveFetch({
      strategy: stubStrategy(targets),
      apiKey: "key",
      mode: "afk",
      fetchFn: okFetch(),
      onCapture: (endpoint) => captured.push(endpoint),
      delayMs: 0,
    });

    expect(status.articles).toBe(2);
    expect(status.collected).toBe(2);
    expect(status.reactions).toBe(0);
    expect(captured).toEqual(["analytics", "analytics"]);
  });

  test("c) throttle: segundo request começa após o primeiro terminar (serial)", async () => {
    const sequence: string[] = [];
    let counter = 0;

    const fetchFn: FetchFn = async (_url) => {
      const id = counter++;
      sequence.push(`start:${id}`);
      await Promise.resolve();
      sequence.push(`end:${id}`);
      return new Response(JSON.stringify({}), { status: 200 });
    };

    await runActiveFetch({
      strategy: stubStrategy([makeTarget("1")]),
      apiKey: "key",
      mode: "onDemand",
      fetchFn,
      onCapture: () => {},
      delayMs: 0,
    });

    expect(sequence).toEqual(["start:0", "end:0", "start:1", "end:1"]);
  });

  test("d) 401 em reactions: sessionNeeded:true, analytics ainda processa", async () => {
    const fetchFn: FetchFn = async (url) => {
      const status = String(url).includes("reactions") ? 401 : 200;
      return new Response(JSON.stringify({}), { status });
    };

    const captured: string[] = [];
    const status = await runActiveFetch({
      strategy: stubStrategy([makeTarget("1")]),
      apiKey: "key",
      mode: "onDemand",
      fetchFn,
      onCapture: (endpoint) => captured.push(endpoint),
      delayMs: 0,
    });

    expect(status.sessionNeeded).toBe(true);
    expect(status.collected).toBe(1);
    expect(captured).toEqual(["analytics"]);
  });

  test("e) apiKey null: apiKeyInvalid:true, collected:0, enumerate não chamado", async () => {
    let enumerateCalled = false;
    const strategy: ActiveFetchStrategy = {
      kind: "activeFetch",
      async enumerate() {
        enumerateCalled = true;
        return [];
      },
      requestsFor: () => [],
    };

    const fetchCalls: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const status = await runActiveFetch({
      strategy,
      apiKey: null,
      mode: "onDemand",
      fetchFn,
      onCapture: () => {},
      delayMs: 0,
    });

    expect(status.apiKeyInvalid).toBe(true);
    expect(status.collected).toBe(0);
    expect(enumerateCalled).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });

  test("f) erro de rede num request individual não interrompe os demais", async () => {
    let callIndex = 0;
    const fetchFn: FetchFn = async (_url) => {
      const i = callIndex++;
      if (i === 0) throw new Error("network error");
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const captured: string[] = [];
    const status = await runActiveFetch({
      strategy: stubStrategy([makeTarget("1")]),
      apiKey: "key",
      mode: "onDemand",
      fetchFn,
      onCapture: (endpoint) => captured.push(endpoint),
      delayMs: 0,
    });

    expect(status.collected).toBe(1);
    expect(captured).toEqual(["reactions"]);
  });

  test("g) 404 em reactions (artigo arquivado): pula silenciosamente, analytics processa", async () => {
    const fetchFn: FetchFn = async (url) => {
      const status = String(url).includes("reactions") ? 404 : 200;
      return new Response(JSON.stringify({}), { status });
    };

    const captured: string[] = [];
    const status = await runActiveFetch({
      strategy: stubStrategy([makeTarget("1")]),
      apiKey: "key",
      mode: "onDemand",
      fetchFn,
      onCapture: (endpoint) => captured.push(endpoint),
      delayMs: 0,
    });

    expect(status.sessionNeeded).toBeUndefined();
    expect(status.collected).toBe(1);
    expect(captured).toEqual(["analytics"]);
  });
});
