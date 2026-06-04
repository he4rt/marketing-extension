// CalibrationCache: assinatura volátil colhida do tráfego Voyager passivo, usada para
// replay no Active Fetch (L3). Vive em MEMÓRIA do service worker — NÃO persiste no store v3,
// some no reload do SW. Núcleo PURO: nenhuma leitura de chrome.* aqui; o csrf-token chega
// já resolvido (= cookie JSESSIONID, lido na borda) via header em harvestSignature.

// Prefixo do queryId Voyager (segmento antes do primeiro ".") → campo da calibração.
const QUERY_ID_PREFIX_TO_FIELD: Record<string, keyof CalibrationCache> = {
  voyagerSocialDashReactions: "queryId_reactions",
  voyagerSocialDashComments: "queryId_comments",
  voyagerFeedDashReshareFeed: "queryId_reposts",
};

export type CalibrationCache = {
  queryId_reactions: string | null; // ex.: "voyagerSocialDashReactions.<hash>"
  queryId_comments: string | null;
  queryId_reposts: string | null;
  clientVersion: string | null; // de x-li-track (clientVersion / mobileappVersion)
  csrfToken: string | null; // = cookie JSESSIONID (sem aspas), lido na borda
  lastUpdated: string | null; // ISO
};

export function emptyCalibration(): CalibrationCache {
  return {
    queryId_reactions: null,
    queryId_comments: null,
    queryId_reposts: null,
    clientVersion: null,
    csrfToken: null,
    lastUpdated: null,
  };
}

// Calibrado o suficiente p/ pelo menos UM endpoint L3 → habilita o botão (Passo 8).
export function isCalibrated(c: CalibrationCache): boolean {
  return Boolean(c.queryId_reactions || c.queryId_comments || c.queryId_reposts);
}

// Singleton em memória do SW.
let singleton: CalibrationCache = emptyCalibration();

export function getCalibration(): CalibrationCache {
  return singleton;
}

// Reset — usado em testes para isolar cenários do harvest (efeito colateral no singleton).
export function resetCalibration(): void {
  singleton = emptyCalibration();
}

// Extrai o queryId completo ("prefixo.hash") da URL Voyager; null se não houver.
function queryIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("queryId");
  } catch {
    return null;
  }
}

// Lê clientVersion de um header x-li-track (JSON: clientVersion | mobileappVersion | mpVersion).
function clientVersionFromTrack(track: string | undefined): string | null {
  if (!track) return null;
  try {
    const parsed = JSON.parse(track) as Record<string, unknown>;
    const version = parsed.clientVersion ?? parsed.mobileappVersion ?? parsed.mpVersion;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

// Colhe queryId/clientVersion/csrf da URL+headers Voyager passivos. Atualiza o singleton;
// NUNCA lança. headers é opcional (XHR/fetch podem não expor) e key-insensitive na leitura.
export function harvestSignature(url: string, headers?: Record<string, string>): void {
  const queryId = queryIdFromUrl(url);
  let mudou = false;

  if (queryId) {
    const prefix = queryId.split(".")[0] || "";
    const field = QUERY_ID_PREFIX_TO_FIELD[prefix];
    if (field) {
      singleton[field] = queryId;
      mudou = true;
    }
  }

  if (headers) {
    const lower = lowercaseKeys(headers);
    const version = clientVersionFromTrack(lower["x-li-track"]);
    if (version) {
      singleton.clientVersion = version;
      mudou = true;
    }
    const csrf = lower["csrf-token"];
    if (csrf) {
      singleton.csrfToken = csrf;
      mudou = true;
    }
  }

  if (mudou) singleton.lastUpdated = new Date().toISOString();
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}
