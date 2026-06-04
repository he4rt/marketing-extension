// buildVoyagerRequest: monta o GET autenticado de replay do Voyager para um alvo + endpoint
// lógico, usando a assinatura COLHIDA (queryId/clientVersion/csrf) da CalibrationCache.
//
// PURO: não lê chrome.*. O csrf-token chega já resolvido na calibração (= cookie JSESSIONID,
// lido na borda durante o harvest). Retorna null quando o replay não é autenticável/calibrável:
//  - endpoint lógico desconhecido;
//  - queryId daquele endpoint ainda não colhido (não calibrado);
//  - csrfToken ausente (sem ele a sessão não autentica o GET).
//
// Auth (ADR-0004): credentials:"include" + csrf-token (=JSESSIONID) + x-restli-protocol-version
// 2.0.0 + accept normalized + x-li-track (clientVersion colhido). queryId colhido na URL.

import type { CalibrationCache } from "./calibration";
import { endpointDescriptor, queryIdFor, type VoyagerEndpointId } from "./endpoints";
import type { ActiveFetchTarget } from "./targets";

const VOYAGER_GRAPHQL = "https://www.linkedin.com/voyager/api/graphql";

export function buildVoyagerRequest(
  target: ActiveFetchTarget,
  endpoint: VoyagerEndpointId,
  calib: CalibrationCache,
): Request | null {
  const descriptor = endpointDescriptor(endpoint);
  if (!descriptor) return null;

  const queryId = queryIdFor(descriptor.id, calib);
  if (!queryId) return null; // endpoint não calibrado → pulado pelo scheduler.
  if (!calib.csrfToken) return null; // sem JSESSIONID não há replay autenticável.

  const variables = descriptor.buildVariables(target.activityUrn);
  const url = `${VOYAGER_GRAPHQL}?queryId=${queryId}&variables=${variables}`;

  return new Request(url, {
    method: "GET",
    credentials: "include",
    headers: buildHeaders(calib),
  });
}

function buildHeaders(calib: CalibrationCache): Headers {
  const headers = new Headers({
    "csrf-token": calib.csrfToken as string,
    "x-restli-protocol-version": "2.0.0",
    accept: "application/vnd.linkedin.normalized+json+2.1",
  });
  // x-li-track só entra quando o clientVersion foi colhido; sem ele, omitimos (request ainda vale).
  if (calib.clientVersion) {
    headers.set("x-li-track", JSON.stringify({ clientVersion: calib.clientVersion }));
  }
  return headers;
}
