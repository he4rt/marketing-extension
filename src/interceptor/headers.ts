// Normalização dos headers de uma requisição fetch para o match() (MAIN world).
//
// A assinatura do L3 (csrf-token + x-li-track) cavalga nos headers das requisições fetch do
// LinkedIn (ex.: rsc-action). O interceptor precisa entregá-los ao match() em formato uniforme.
// PURO: nenhum chrome.*; nunca lança. Chaves SEMPRE em minúsculas (HTTP é case-insensitive e
// a calibração lê por chave minúscula).
//
// Fontes possíveis (em ordem de precedência): init.headers (string→Request) e, quando o
// recurso é um Request, os headers do próprio Request. O init tem prioridade quando ambos
// definem a mesma chave (espelha o comportamento do fetch).

type HeadersInitLike = Headers | string[][] | Record<string, string> | undefined;

function fromHeadersInit(init: HeadersInitLike, out: Record<string, string>): void {
  if (!init) return;
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return;
  }
  if (Array.isArray(init)) {
    for (const pair of init) {
      if (pair?.[0] != null) out[pair[0].toLowerCase()] = pair[1] ?? "";
    }
    return;
  }
  for (const [key, value] of Object.entries(init)) out[key.toLowerCase()] = value;
}

// Funde os headers do Request (se o recurso for um) com os do init. init vence em colisão.
export function normalizeHeaders(
  resource: RequestInfo | URL,
  init?: RequestInit | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (resource instanceof Request) fromHeadersInit(resource.headers, out);
  fromHeadersInit(init?.headers as HeadersInitLike, out);
  return out;
}
