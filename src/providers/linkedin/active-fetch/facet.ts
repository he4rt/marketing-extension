// Faceta Active Fetch do LinkedIn — implementa o seam genérico (src/capture/active-fetch.ts)
// reusando os módulos pequenos desta pasta:
//  - targets.ts          → enumera os activity_urn descobertos na busca (enumerate);
//  - endpoints.ts        → os 3 endpoints Voyager L3 e a validação de id (endpoints);
//  - voyager-request.ts  → monta o GET credenciado por assinatura colhida (buildRequest);
//  - synthEnvelope       → empacota a resposta num CapturedPayloadMessage idêntico ao passivo,
//                          com endpoint/url que os ramos de processLinkedInCapture já roteiam.
//
// Sem `if` por rede no scheduler: ele só consome esta faceta via ACTIVE_FETCH_FACETS.

import type {
  ActiveFetchFacet,
  ActiveFetchTarget,
  SyntheticCapture,
} from "../../../capture/active-fetch";
import type { CalibrationCache } from "./calibration";
import { refreshCsrfFromCookie } from "./csrf";
import { endpointDescriptor, type VoyagerEndpointId, voyagerEndpointIds } from "./endpoints";
import { enumerateTargets } from "./targets";
import { buildVoyagerRequest } from "./voyager-request";

// Endpoint lógico válido (descritor conhecido) → narrow para VoyagerEndpointId.
function asVoyagerEndpoint(endpoint: string): VoyagerEndpointId | null {
  return endpointDescriptor(endpoint)?.id ?? null;
}

export const linkedinActiveFetchFacet: ActiveFetchFacet = {
  id: "linkedin",

  // Lê o csrf fresco do cookie JSESSIONID antes do replay (o harvest de headers não o vê no SW).
  refreshAuth: refreshCsrfFromCookie,

  enumerate: (store) => enumerateTargets(store),

  // Mesma ordem do fan-out: reactions → comments → reposts.
  endpoints: (_target) => voyagerEndpointIds(),

  buildRequest: (target: ActiveFetchTarget, endpoint: string, calib: CalibrationCache) => {
    const id = asVoyagerEndpoint(endpoint);
    if (!id) return null; // endpoint desconhecido (drift) → pulado pelo scheduler.
    return buildVoyagerRequest(target, id, calib);
  },

  synthEnvelope: (
    _target: ActiveFetchTarget,
    endpoint: string,
    payload: unknown,
    url: string,
  ): SyntheticCapture => ({
    action: "CAPTURED_PAYLOAD",
    provider: "linkedin",
    endpoint, // bate com os ramos atuais de processLinkedInCapture (reactions/comments/reposts).
    payload,
    url,
    timestamp: new Date().toISOString(),
  }),
};
