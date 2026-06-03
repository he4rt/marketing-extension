import type { NetworkInterceptStrategy } from "../../capture/strategies";

// Estratégia de captura do X (MAIN world). Lógica MOVIDA, sem reescrita, do antigo
// extractXEndpointName de src/interceptor/index.ts: o X só intercepta chamadas ao
// GraphQL interno e usa o segmento de caminho após o queryId como nome do endpoint.

const X_GRAPHQL_PATH = "/i/api/graphql/";

function extractXEndpointName(url: string) {
  const idx = url.indexOf(X_GRAPHQL_PATH);
  if (idx === -1) return null;
  const after = url.substring(idx + X_GRAPHQL_PATH.length);
  const parts = after.split("/");
  if (parts.length < 2) return null;
  return parts[1]?.split("?")[0] || null;
}

export const xNetworkIntercept: NetworkInterceptStrategy = {
  kind: "networkIntercept",
  match(url) {
    const endpoint = extractXEndpointName(url);
    return endpoint ? { endpoint } : null;
  },
};
