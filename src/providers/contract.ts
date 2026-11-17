import type { BackgroundStore, SocialProvider, SocialPublication } from "../shared/domain";
import type { CapturedPayloadMessage } from "../shared/messages";

// Contrato do Provider no service worker.
// A faceta de processamento normaliza a captura para o NormalizedStore per-platform
// (store.platforms.<id>). As facetas de captura (MAIN/ISO), scope e export são
// módulos separados do provider.
export type CaptureProcessor = (store: BackgroundStore, capture: CapturedPayloadMessage) => void;

export type BackgroundProviderFacet = {
  id: SocialProvider;
  processCapture: CaptureProcessor;
  // Modos de Scope (#9) declarados pelo provider — usados pela detecção de Collection
  // Target (DETECT_TARGET/detectFromPage) e pelo filtro por modo. Ver ScopeMode abaixo.
  scopeModes: ScopeMode[];

  // Dispatch hooks — métodos opcionais que cada provider implementa para desacoplar
  // lógica específica do controller genérico. Se não implementado, o controller usa
  // fallback inline (comportamento preservado).
  buildPlatformData?(store: BackgroundStore): unknown;
  computePopupSummary?(store: BackgroundStore): {
    content_count: number;
    engager_count: number;
  };
  restoreVisibleData?(store: BackgroundStore, saved: unknown): void;
  reprocessVisibleComments?(store: BackgroundStore, saved: unknown): void;
  buildExportPlatformData?(store: BackgroundStore): unknown;
  computeExportSummary?(store: BackgroundStore): unknown;
};

// Seam de Scope (#9): torna o modo de coleta DECLARÁVEL por provider sem mover ainda
// o filtro real (que segue dentro dos parsers/process*). Um ScopeMode descreve COMO
// um alvo de coleta seleciona publicações; detectFromPage extrai o valor a partir da
// URL/DOM da página (preenchido nas fatias com browser). selects() é a predicate pura
// usada por testes e, futuramente, pelo filtro-por-scope no parse.
export type ScopeMode = {
  id: string;
  label: string;
  detectFromPage?: (pageUrl: string, doc?: Document) => string | null;
  selects: (pub: SocialPublication, value: string) => boolean;
};

// Alvo de coleta resolvido: provider + modo escolhido + valor concreto (ex.: handle).
export type CollectionTarget = {
  provider: SocialProvider;
  mode: string;
  value: string;
};
