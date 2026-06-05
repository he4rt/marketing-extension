// Seleção dos headers de assinatura L3 do LinkedIn a encaminhar do MAIN ao SW.
//
// Só campos NÃO-secretos entram: x-li-track (→ clientVersion). O csrf-token é deliberadamente
// EXCLUÍDO — o SW o lê do cookie JSESSIONID (ver active-fetch/csrf.ts), nunca via postMessage.

const SIGNATURE_HEADERS = ["x-li-track"];

// Extrai do conjunto de headers só os campos de assinatura presentes. undefined se nenhum,
// para não inflar a mensagem de captura à toa.
export function signatureFromHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const key of SIGNATURE_HEADERS) {
    if (headers[key]) out[key] = headers[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
