// Scheduler do Active Fetch (L3) — #16/#17. Aprofundamento on-demand: enumera os alvos
// (URNs) da busca e faz fan-out SEQUENCIAL com delay nos endpoints Voyager por URN. Cada
// resposta vira um envelope SINTÉTICO idêntico ao da captura passiva → MESMO processCapture
// (Actors de reação/repost + comentários com a mesma consolidação/provenance). Parada
// GRACIOSA em 401/403/429/challenge (progresso parcial k/N). SEM AFK. Registry-driven
// (ADR-0002), sem importar o controller (evita ciclo). Delay/throttle em ./active-fetch-policy.

import type { ActiveFetchFacet } from "../capture/active-fetch";
import type { BackgroundProviderFacet } from "../providers/contract";
import { linkedinProvider } from "../providers/linkedin";
import { getCalibration } from "../providers/linkedin/active-fetch/calibration";
import { linkedinActiveFetchFacet } from "../providers/linkedin/active-fetch/facet";
import type { BackgroundStore, NormalizedStore, SocialProvider } from "../shared/domain";
import {
  classifyStatus,
  DELAY_PADRAO_MS,
  DELAY_RATE_LIMIT_MS,
  ERRO_REDE,
  isFatal,
  type StatusKind,
  sleep,
} from "./active-fetch-policy";

export type ActiveFetchStatus = {
  running: boolean;
  total: number; // alvos × endpoints calibrados (planejados antes do fan-out)
  done: number; // requisições concluídas (sucesso ou pulo)
  actorsCaptured: number; // Actors novos consolidados no store durante o run
  startedAt: string | null;
  finishedAt: string | null;
  error?: string; // "uncalibrated" | "session_expired" | "rate_limited" | "error"
};

// Registries locais (caminho ATIVO). Importar daqui evita o ciclo controller↔active-fetch.
const ACTIVE_FETCH_FACETS: Partial<Record<SocialProvider, ActiveFetchFacet>> = {
  linkedin: linkedinActiveFetchFacet,
};
const PROCESSORS: Partial<Record<SocialProvider, BackgroundProviderFacet>> = {
  linkedin: linkedinProvider,
};

// Singleton de status por provider (lido pelo polling GET_ACTIVE_FETCH_STATUS).
const statusByProvider: Partial<Record<SocialProvider, ActiveFetchStatus>> = {};

function emptyStatus(): ActiveFetchStatus {
  return {
    running: false,
    total: 0,
    done: 0,
    actorsCaptured: 0,
    startedAt: null,
    finishedAt: null,
  };
}

export function getActiveFetchStatus(provider: SocialProvider): ActiveFetchStatus {
  return statusByProvider[provider] ?? emptyStatus();
}

// Total de engagements (Actors) consolidados no store per-platform (base do delta do run).
function countActors(store: BackgroundStore, provider: SocialProvider): number {
  const pstore = store.platforms[provider] as NormalizedStore;
  let total = 0;
  for (const list of Object.values(pstore.engagementsByPublication)) total += list.length;
  return total;
}

// UMA requisição (alvo, endpoint): fetch credenciado → envelope sintético → processCapture.
// Devolve o StatusKind para o loop decidir parar/atrasar/seguir.
async function runOne(
  store: BackgroundStore,
  facet: ActiveFetchFacet,
  processor: BackgroundProviderFacet,
  target: ReturnType<ActiveFetchFacet["enumerate"]>[number],
  endpoint: string,
): Promise<StatusKind> {
  const request = facet.buildRequest(target, endpoint, getCalibration());
  if (!request) return "ok"; // não calibrado p/ este endpoint → pula sem abortar.
  try {
    const response = await fetch(request);
    const kind = classifyStatus(response.status);
    if (kind !== "ok") return kind;
    const payload = await response.json();
    const envelope = facet.synthEnvelope(target, endpoint, payload, request.url);
    processor.processCapture(store, envelope);
    return "ok";
  } catch {
    return ERRO_REDE; // fetch rejeitado (offline/CORS) → parada graciosa.
  }
}

// Fan-out SEQUENCIAL com delay sobre alvos × endpoints. Mutável: atualiza o singleton de
// status a cada passo para o polling enxergar o progresso parcial.
export async function runActiveFetch(
  store: BackgroundStore,
  provider: SocialProvider,
): Promise<ActiveFetchStatus> {
  const facet = ACTIVE_FETCH_FACETS[provider];
  const processor = PROCESSORS[provider];
  if (!facet || !processor) {
    const s = { ...emptyStatus(), error: "error" as const };
    statusByProvider[provider] = s;
    return s;
  }

  // Plano: alvos × endpoints calibrados (buildRequest != null sinaliza calibração).
  const targets = facet.enumerate(store);
  const calib = getCalibration();
  const plano: Array<{ target: (typeof targets)[number]; endpoint: string }> = [];
  for (const target of targets) {
    for (const endpoint of facet.endpoints(target)) {
      if (facet.buildRequest(target, endpoint, calib)) plano.push({ target, endpoint });
    }
  }
  const actorsBefore = countActors(store, provider);
  const status: ActiveFetchStatus = {
    ...emptyStatus(),
    running: true,
    total: plano.length,
    startedAt: new Date().toISOString(),
  };
  statusByProvider[provider] = status;

  if (plano.length === 0) {
    status.running = false;
    status.error = "uncalibrated";
    status.finishedAt = new Date().toISOString();
    return status;
  }

  for (let i = 0; i < plano.length; i++) {
    const passo = plano[i];
    if (!passo) continue;
    const kind = await runOne(store, facet, processor, passo.target, passo.endpoint);
    status.done = i + 1;
    status.actorsCaptured = countActors(store, provider) - actorsBefore;

    if (isFatal(kind)) {
      status.error = kind; // "session_expired" | "error" (isFatal garante o narrow).
      break;
    }
    if (i < plano.length - 1) {
      await sleep(kind === "rate_limited" ? DELAY_RATE_LIMIT_MS : DELAY_PADRAO_MS);
    }
  }

  status.running = false;
  status.finishedAt = new Date().toISOString();
  return status;
}
