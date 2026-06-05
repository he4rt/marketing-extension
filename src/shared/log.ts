// Logger central do He4rt Analytics. Um único ponto para padronizar o prefixo e anexar uma
// CATEGORIA, para filtrar no console (ex.: filtrar por "[He4rt Analytics] [net]"). Cobre os
// dois tipos de log do projeto:
//   - quantitativo: contagens, bytes, k/N (quanto?);
//   - qualitativo:  endpoint, autor, quais campos da assinatura foram colhidos (o quê/quem?).
//
// Funciona em qualquer contexto (MAIN/ISOLATED/background): só usa console.log. Importável por
// todos os bundles. `data` opcional vira o 2º argumento do console (objeto inspecionável).

const PREFIX = "[He4rt Analytics]";

// Categorias conhecidas (livre, mas centralizar ajuda o grep no console):
//   net    → request/response interceptados (interceptor MAIN)
//   bridge → encaminhamento content→background (ISOLATED)
//   calib  → assinatura L3 colhida (queryId/csrf/clientVersion)
//   busca  → diagnóstico da descoberta SDUI (background)
//   store  → consolidação por provider (delta no store)
//   L3     → active fetch (plano, dry-run, replay)
export type LogCategory = "net" | "bridge" | "calib" | "busca" | "store" | "L3";

export function logHe4rt(category: LogCategory, message: string, data?: unknown): void {
  const head = `${PREFIX} [${category}] ${message}`;
  if (data === undefined) console.log(head);
  else console.log(head, data);
}

// Tamanho aproximado de um payload para logs quantitativos (bytes do texto/JSON). Nunca lança.
export function approxBytes(payload: unknown): number {
  try {
    return typeof payload === "string" ? payload.length : JSON.stringify(payload).length;
  } catch {
    return -1;
  }
}
