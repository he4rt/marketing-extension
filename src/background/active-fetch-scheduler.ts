import type { ActiveFetchStatus, ActiveFetchStrategy } from "../providers/devto/active-fetch";

type FetchFn = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runActiveFetch(opts: {
  strategy: ActiveFetchStrategy;
  apiKey: string | null;
  mode: "onDemand" | "afk";
  fetchFn?: FetchFn;
  onCapture: (endpoint: string, payload: unknown) => void;
  delayMs?: number;
}): Promise<ActiveFetchStatus> {
  const { strategy, apiKey, mode, fetchFn = fetch as FetchFn, onCapture, delayMs = 300 } = opts;

  if (!apiKey) {
    return { collected: 0, articles: 0, reactions: 0, apiKeyInvalid: true };
  }

  const targets = await strategy.enumerate({ apiKey });

  if (targets.length === 0) {
    return { collected: 0, articles: 0, reactions: 0 };
  }

  const requests = targets.flatMap((target) =>
    strategy.requestsFor(target).filter((req) => mode === "onDemand" || req.afkSafe),
  );

  let collected = 0;
  let reactionCount = 0;
  let sessionNeeded = false;

  for (const [i, req] of requests.entries()) {
    if (i > 0) await sleep(delayMs);
    try {
      const fetchOpts: RequestInit =
        req.auth === "api-key"
          ? { headers: { "api-key": apiKey } }
          : { credentials: "include" };
      const res = await fetchFn(req.url, fetchOpts);
      if (res.status === 401 || res.status === 403) {
        sessionNeeded = true;
        continue;
      }
      const payload = await res.json();
      onCapture(req.endpoint, payload);
      collected++;
      if (req.endpoint === "reactions") reactionCount++;
    } catch {
      // rede falhou neste request individual — segue para o próximo
    }
  }

  const status: ActiveFetchStatus = {
    collected,
    articles: targets.length,
    reactions: reactionCount,
  };
  if (sessionNeeded) status.sessionNeeded = true;
  return status;
}
