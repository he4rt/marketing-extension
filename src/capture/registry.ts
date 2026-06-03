import {
  instagramNetworkIntercept,
  instagramSsrScriptScan,
  instagramVisibleCommentsScrape,
  instagramVisiblePublicationsScrape,
} from "../providers/instagram/capture";
import { linkedinEmbeddedCodeScan, linkedinNetworkIntercept } from "../providers/linkedin/capture";
import { providerForHost } from "../providers/meta";
import { xNetworkIntercept } from "../providers/x/capture";
import type { SocialProvider } from "../shared/domain";
import type { CaptureFacet } from "./strategies";

// Registry de captura: a única fonte de verdade sobre QUAIS estratégias cada provider
// declara. Os motores (interceptor MAIN / content ISOLATED) iteram este mapa em vez de
// um if-cascade por provider. Adicionar um provider de captura começa aqui.
export const CAPTURE_FACETS: Record<SocialProvider, CaptureFacet> = {
  x: {
    id: "x",
    networkIntercept: xNetworkIntercept,
  },
  linkedin: {
    id: "linkedin",
    networkIntercept: linkedinNetworkIntercept,
    embeddedCodeScan: linkedinEmbeddedCodeScan,
  },
  instagram: {
    id: "instagram",
    networkIntercept: instagramNetworkIntercept,
    ssrScriptScan: instagramSsrScriptScan,
    liveDomScrapes: [instagramVisiblePublicationsScrape, instagramVisibleCommentsScrape],
  },
};

export function captureFacetForHost(hostname: string): CaptureFacet | null {
  const provider = providerForHost(hostname);
  return provider ? CAPTURE_FACETS[provider] : null;
}

export function captureFacetForProvider(provider: SocialProvider): CaptureFacet {
  return CAPTURE_FACETS[provider];
}
