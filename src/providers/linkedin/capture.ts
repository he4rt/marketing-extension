import type { EmbeddedCodeScanStrategy, NetworkInterceptStrategy } from "../../capture/strategies";

// Estratégias de captura do LinkedIn. Lógica MOVIDA, sem reescrita:
//  - networkIntercept: extractLinkedInEndpointName do antigo src/interceptor/index.ts
//    (mapeia o prefixo do queryId Voyager para o nome de endpoint conhecido);
//  - embeddedCodeScan: processLinkedInBprElement do antigo src/content/index.ts
//    (lê <code id="bpr-guid-*"> com payload JSON escapado em HTML).

const LINKEDIN_VOYAGER_PATH = "/voyager/api/graphql";

const LINKEDIN_ENDPOINT_MAP: Record<string, string> = {
  voyagerFeedDashOrganizationalPageUpdates: "feedDashOrganizationalPageUpdates",
  voyagerSocialDashReactions: "socialDashReactions",
  voyagerFeedDashReshareFeed: "feedDashReshareFeed",
  voyagerSocialDashComments: "socialDashComments",
};

function extractLinkedInEndpointName(url: string) {
  const idx = url.indexOf(LINKEDIN_VOYAGER_PATH);
  if (idx === -1) return null;
  try {
    const parsed = new URL(url, window.location.href);
    const queryId = parsed.searchParams.get("queryId");
    if (!queryId) return null;
    const prefix = queryId.split(".")[0] || "";
    return LINKEDIN_ENDPOINT_MAP[prefix] || prefix;
  } catch {
    return null;
  }
}

export const linkedinNetworkIntercept: NetworkInterceptStrategy = {
  kind: "networkIntercept",
  match(url) {
    const endpoint = extractLinkedInEndpointName(url);
    return endpoint ? { endpoint } : null;
  },
};

// --- embeddedCodeScan: BPR (Batched Page Request) -------------------------

const processedLinkedInBprGuids = new Set<string>();

function unescapeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#92;u/g, "\\u")
    .replace(/&#(\d+);/g, (_: string, c: string) => String.fromCharCode(Number(c)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function normalizeKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[key.trim()] = normalizeKeys(value);
  }
  return normalized;
}

export const linkedinEmbeddedCodeScan: EmbeddedCodeScanStrategy = {
  kind: "embeddedCodeScan",
  selector: 'code[id^="bpr-guid-"]',
  match(el) {
    return el.tagName === "CODE" && Boolean((el as HTMLElement).id?.startsWith("bpr-guid-"));
  },
  parse(raw, el) {
    const id = (el as HTMLElement).id;
    if (!id?.startsWith("bpr-guid-")) return null;
    const guid = id.replace("bpr-guid-", "");
    if (processedLinkedInBprGuids.has(guid)) return null;
    processedLinkedInBprGuids.add(guid);

    try {
      if (raw.length < 50) return null;
      const unescaped = unescapeHtml(raw);
      const parsed = JSON.parse(unescaped);
      const normalized = normalizeKeys(parsed) as Record<string, unknown>;
      const innerData =
        ((normalized?.data as Record<string, unknown>)?.data as Record<string, unknown>) || {};

      const feedKey = Object.keys(innerData).find(
        (k) =>
          k.startsWith("feedDashOrganizationalPageUpdates") &&
          Array.isArray((innerData[k] as Record<string, unknown>)?.["*elements"]),
      );
      if (!feedKey) return null;

      const elements = (innerData[feedKey] as Record<string, unknown>)?.["*elements"] as
        | string[]
        | undefined;
      if (!elements?.length) return null;

      return {
        endpoint: "feedDashOrganizationalPageUpdates",
        url: `https://www.linkedin.com/bpr/${feedKey}`,
        payload: normalized,
      };
    } catch {
      // BPR parse failure is non-critical
      return null;
    }
  },
};
