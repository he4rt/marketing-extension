import type { BackgroundStore, SocialProvider } from "../shared/domain";
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
