import type { EmbeddedCodeScanStrategy, NetworkInterceptStrategy } from "../../capture/strategies";
import { harvestSignature } from "./active-fetch/calibration";

// Estratégias de captura do LinkedIn. Lógica MOVIDA, sem reescrita:
//  - networkIntercept: extractLinkedInEndpointName do antigo src/interceptor/index.ts
//    (mapeia o prefixo do queryId Voyager para o nome de endpoint conhecido);
//  - embeddedCodeScan: processLinkedInBprElement do antigo src/content/index.ts
//    (lê <code id="bpr-guid-*"> com payload JSON escapado em HTML).

const LINKEDIN_VOYAGER_PATH = "/voyager/api/graphql";

// Estágio 1 (descoberta): SRP de busca. A resposta é um stream React-Flight
// (octet-stream), NÃO JSON — por isso o match pede responseFormat:"text" para o
// interceptor ler clone.text() e o parser SDUI receber a string crua. Cobre a aba de
// conteúdo (`/content/`) e a `/all/` — ambas trazem cabeçalhos `feed-actor`.
const LINKEDIN_SEARCH_PATH = "/flagship-web/search/results/";

// Streams SDUI PREGUIÇOSOS do scroll/barra-social: `pagination` (próximas páginas) e
// `component` (re-render de componentes). Carregam os MESMOS cabeçalhos de post + os
// contadores de reação/comentário/repost que NÃO vêm no render inicial. São usados
// também pelo FEED — por isso só capturamos quando a página atual é uma SRP de busca.
const LINKEDIN_RSC_SEARCH_PATHS = [
  "/rsc-action/actions/pagination",
  "/rsc-action/actions/component",
];

function onLinkedInSearchPage(): boolean {
  try {
    return window.location.pathname.includes("/search/results/");
  } catch {
    return false;
  }
}

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
    // Estágio 1 — descoberta SDUI: o SRP de busca devolve um stream Flight (texto).
    if (url.includes(LINKEDIN_SEARCH_PATH)) {
      return { endpoint: "searchResultsContent", responseFormat: "text" };
    }
    // Métricas preguiçosas: pagination/component da busca trazem posts + contadores.
    // Só na SRP (a mesma rota serve o feed) — o merge por URN acontece no processCapture.
    if (onLinkedInSearchPage() && LINKEDIN_RSC_SEARCH_PATHS.some((p) => url.includes(p))) {
      return { endpoint: "searchResultsContent", responseFormat: "text" };
    }
    const endpoint = extractLinkedInEndpointName(url);
    if (!endpoint) return null;
    // Harvest-and-cache: ao ver tráfego Voyager passivo (ex.: usuário abre um post),
    // colhe a assinatura volátil (queryId/clientVersion) p/ o Active Fetch (L3) replicar.
    harvestSignature(url);
    return { endpoint };
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
