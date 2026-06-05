// Estado/progresso do Active Fetch (L3), separado do scheduler para mantê-lo <150 linhas.
// Singleton em memória do SW, lido pelo polling GET_ACTIVE_FETCH_STATUS. PURO: sem chrome.*.

import type { BackgroundStore, NormalizedStore, SocialProvider } from "../shared/domain";

export type ActiveFetchStatus = {
  running: boolean;
  total: number; // alvos × endpoints calibrados (planejados antes do fan-out)
  done: number; // requisições concluídas (sucesso ou pulo)
  actorsCaptured: number; // Actors novos consolidados no store durante o run
  startedAt: string | null;
  finishedAt: string | null;
  dryRun: boolean; // true = montou+logou os requests, NÃO originou tráfego (gate de ToS).
  error?: string; // "uncalibrated" | "session_expired" | "rate_limited" | "error"
};

// Singleton de status por provider.
const statusByProvider: Partial<Record<SocialProvider, ActiveFetchStatus>> = {};

export function emptyStatus(): ActiveFetchStatus {
  return {
    running: false,
    total: 0,
    done: 0,
    actorsCaptured: 0,
    startedAt: null,
    finishedAt: null,
    dryRun: true,
  };
}

export function getActiveFetchStatus(provider: SocialProvider): ActiveFetchStatus {
  return statusByProvider[provider] ?? emptyStatus();
}

// Publica o status do run no singleton (a mesma referência é mutada durante o fan-out).
export function setActiveFetchStatus(provider: SocialProvider, status: ActiveFetchStatus): void {
  statusByProvider[provider] = status;
}

// Total de engagements (Actors) consolidados no store per-platform (base do delta do run).
export function countActors(store: BackgroundStore, provider: SocialProvider): number {
  const pstore = store.platforms[provider] as NormalizedStore;
  let total = 0;
  for (const list of Object.values(pstore.engagementsByPublication)) total += list.length;
  return total;
}
