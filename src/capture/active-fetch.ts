// Seam Active Fetch (ADR-0003/0004) — tipos do aprofundamento L3 on-demand.
//
// Este arquivo é a fronteira GENÉRICA do Active Fetch: define o contrato que um
// provider implementa para que o scheduler do background (src/background/active-fetch.ts)
// faça o fan-out sem conhecer redes individuais. Espelha a ideia de BACKGROUND_PROVIDERS
// (registro paralelo), mas para o caminho ATIVO (replay credenciado) em vez do passivo.
//
// Sem chrome.*, sem lógica de rede: só TIPOS. O scheduler concreto e a faceta de cada
// provider moram fora daqui. Camadas genéricas iteram o registry; nenhum `if` por rede.

import type { CalibrationCache } from "../providers/linkedin/active-fetch/calibration";
import type { BackgroundStore, SocialProvider } from "../shared/domain";
import type { CapturedPayloadMessage } from "../shared/messages";

// Um alvo de aprofundamento: identidade lógica estável + a URN da atividade a aprofundar.
// (LinkedIn: o próprio activity_urn descoberto na busca SDUI.)
export type ActiveFetchTarget = {
  id: string; // chave estável (ex.: o próprio activity_urn)
  activityUrn: string; // urn:li:activity:...
};

// Envelope sintético que o fan-out injeta no processCapture. NÃO é um shape novo:
// é LITERALMENTE o envelope da captura passiva (CapturedPayloadMessage). Assim o
// aprofundamento reusa os ramos existentes de processCapture, sem código de parsing novo.
export type SyntheticCapture = CapturedPayloadMessage;

// Faceta Active Fetch de um provider — registro PARALELO a BACKGROUND_PROVIDERS.
// O scheduler genérico chama, em ordem: enumerate(store) → para cada alvo,
// endpoints(target) → buildRequest(target, endpoint, calib) → fetch → synthEnvelope.
export type ActiveFetchFacet = {
  id: SocialProvider;

  // Opcional: renova credenciais voláteis ANTES do fan-out (ex.: LinkedIn lê o csrf do
  // cookie JSESSIONID via chrome.cookies). O scheduler awaita isto se presente. É o único
  // ponto onde o caminho ativo toca chrome.* — fica na faceta do provider, não no genérico.
  refreshAuth?: () => Promise<void>;

  // Enumera os alvos a partir do store consolidado (LinkedIn: os activity_urn da busca).
  enumerate: (store: BackgroundStore) => ActiveFetchTarget[];

  // Endpoints lógicos a aprofundar por alvo, na ORDEM de fan-out.
  endpoints: (target: ActiveFetchTarget) => string[];

  // Monta o Request GET credenciado para (alvo, endpoint); null se não calibrado
  // (o scheduler pula o endpoint).
  buildRequest: (
    target: ActiveFetchTarget,
    endpoint: string,
    calib: CalibrationCache,
  ) => Request | null;

  // Empacota a resposta crua num envelope idêntico ao da captura passiva, para o
  // scheduler entregar a BACKGROUND_PROVIDERS[provider].processCapture sem caminho novo.
  synthEnvelope: (
    target: ActiveFetchTarget,
    endpoint: string,
    payload: unknown,
    url: string,
  ) => SyntheticCapture;
};
