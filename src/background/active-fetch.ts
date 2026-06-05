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
import type { BackgroundStore, SocialProvider } from "../shared/domain";
import { logHe4rt } from "../shared/log";
import {
  classifyStatus,
  DELAY_PADRAO_MS,
  DELAY_RATE_LIMIT_MS,
  ERRO_REDE,
  isFatal,
  MAX_ALVOS_POR_RUN,
  type StatusKind,
  sleep,
} from "./active-fetch-policy";
import {
  type ActiveFetchStatus,
  countActors,
  emptyStatus,
  getActiveFetchStatus,
  setActiveFetchStatus,
} from "./active-fetch-status";

// Re-export para os consumidores atuais (controller) seguirem importando daqui.
export { type ActiveFetchStatus, getActiveFetchStatus };

// Registries locais (caminho ATIVO). Importar daqui evita o ciclo controller↔active-fetch.
const ACTIVE_FETCH_FACETS: Partial<Record<SocialProvider, ActiveFetchFacet>> = {
  linkedin: linkedinActiveFetchFacet,
};
const PROCESSORS: Partial<Record<SocialProvider, BackgroundProviderFacet>> = {
  linkedin: linkedinProvider,
};

// UMA requisição (alvo, endpoint): fetch credenciado → envelope sintético → processCapture.
// Devolve o StatusKind para o loop decidir parar/atrasar/seguir.
async function runOne(
  store: BackgroundStore,
  facet: ActiveFetchFacet,
  processor: BackgroundProviderFacet,
  target: ReturnType<ActiveFetchFacet["enumerate"]>[number],
  endpoint: string,
  dryRun: boolean,
): Promise<StatusKind> {
  const request = facet.buildRequest(target, endpoint, getCalibration());
  if (!request) return "ok"; // não calibrado p/ este endpoint → pula sem abortar.
  if (dryRun) {
    // Gate de ToS: monta o request real e LOGA, mas NÃO origina tráfego. actorsCaptured
    // permanece 0 (nada é consolidado). Conta como passo concluído para o progresso.
    logHe4rt("L3", `dry-run ${endpoint} → ${request.url}`);
    return "ok";
  }
  try {
    const response = await fetch(request);
    const kind = classifyStatus(response.status);
    logHe4rt("L3", `replay ${endpoint} · status=${response.status} (${kind})`);
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
  dryRun = true,
): Promise<ActiveFetchStatus> {
  const facet = ACTIVE_FETCH_FACETS[provider];
  const processor = PROCESSORS[provider];
  if (!facet || !processor) {
    const s = { ...emptyStatus(), dryRun, error: "error" as const };
    setActiveFetchStatus(provider, s);
    return s;
  }

  // Renova credenciais voláteis (LinkedIn: csrf do cookie JSESSIONID) antes de montar os
  // requests — sem isto, buildVoyagerRequest devolveria null por falta de csrf.
  await facet.refreshAuth?.();

  // Plano: alvos × endpoints calibrados (buildRequest != null sinaliza calibração). O cap
  // de volume pega só os primeiros da ordem do feed (conservador — ver MAX_ALVOS_POR_RUN).
  const targets = facet.enumerate(store).slice(0, MAX_ALVOS_POR_RUN);
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
    dryRun,
  };
  setActiveFetchStatus(provider, status);

  // Quantitativo: alvos enumerados, passos calibrados e modo (dry-run vs real).
  logHe4rt(
    "L3",
    `plano ${provider}: ${targets.length} alvos · ${plano.length} passos · ${dryRun ? "dry-run" : "REAL"}`,
  );

  if (plano.length === 0) {
    status.running = false;
    status.error = "uncalibrated";
    status.finishedAt = new Date().toISOString();
    logHe4rt("L3", `plano vazio → uncalibrated (assinatura incompleta?)`);
    return status;
  }

  for (let i = 0; i < plano.length; i++) {
    const passo = plano[i];
    if (!passo) continue;
    const kind = await runOne(store, facet, processor, passo.target, passo.endpoint, dryRun);
    status.done = i + 1;
    status.actorsCaptured = countActors(store, provider) - actorsBefore;

    if (isFatal(kind)) {
      status.error = kind; // "session_expired" | "error" (isFatal garante o narrow).
      break;
    }
    // Em dry-run nada toca a rede → não há rate-limit a respeitar; pula o delay.
    if (!dryRun && i < plano.length - 1) {
      await sleep(kind === "rate_limited" ? DELAY_RATE_LIMIT_MS : DELAY_PADRAO_MS);
    }
  }

  status.running = false;
  status.finishedAt = new Date().toISOString();
  return status;
}
