import type { BackgroundStore, SocialProvider, SocialPublication } from "../shared/domain";
import type { CapturedPayloadMessage } from "../shared/messages";

// Contrato do Provider no service worker (estado strangler).
// Hoje a faceta de processamento muta o store legado in-place; nas fatias de migração
// por provider ela passa a normalizar para o NormalizedStore. As facetas de captura
// (MAIN/ISO), scope e export entram nas fatias seguintes.
export type CaptureProcessor = (store: BackgroundStore, capture: CapturedPayloadMessage) => void;

export type BackgroundProviderFacet = {
  id: SocialProvider;
  processCapture: CaptureProcessor;
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
