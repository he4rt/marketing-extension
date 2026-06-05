// Política de loop/throttle do scheduler de Active Fetch (extraída para manter o
// scheduler <150 linhas). PURO o suficiente: só temporização e classificação de respostas.
//
// Princípio (ADR-0004): on-demand, SEQUENCIAL, com delay entre requisições para imitar o
// ritmo do tráfego da sessão e não martelar os endpoints (PerimeterX/Cloudflare). Parada
// GRACIOSA em sinais de bloqueio/expiração; sem reentrância, sem AFK.

// Delay padrão entre requisições do fan-out (ms). Sequencial: uma de cada vez.
export const DELAY_PADRAO_MS = 1200;

// Delay extra ao bater rate-limit (429): respeita o backoff antes de seguir, sem repetir.
export const DELAY_RATE_LIMIT_MS = 5000;

// Volume conservador do fan-out: limita os alvos por execução para reduzir a exposição a
// bot-detection (PerimeterX/Cloudflare). Pega os primeiros da ordem do feed (os top posts,
// que mais sofrem com metrics:0). On-demand — o usuário pode repetir para aprofundar mais.
export const MAX_ALVOS_POR_RUN = 5;

// Espera não-bloqueante. setTimeout via Promise (service worker friendly).
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Classificação do status HTTP de uma resposta do fan-out.
//  - "ok": prosseguir (2xx);
//  - "rate_limited": 429 → esperar mais antes da próxima, NÃO abortar;
//  - "session_expired": 401/403/challenge px → PARAR gracioso (sessão inválida);
//  - "error": demais não-ok → PARAR gracioso (falha inesperada).
export type StatusKind = "ok" | "rate_limited" | "session_expired" | "error";

// Status que indicam challenge/bloqueio do PerimeterX/edge → tratamos como expiração.
const STATUS_BLOQUEIO = new Set([401, 403, 999]);

export function classifyStatus(status: number): StatusKind {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "rate_limited";
  if (STATUS_BLOQUEIO.has(status)) return "session_expired";
  return "error";
}

// Um StatusKind interrompe o fan-out (parada graciosa) quando não é "ok"/"rate_limited".
export function isFatal(kind: StatusKind): boolean {
  return kind === "session_expired" || kind === "error";
}

// Erro de rede (fetch rejeitado: offline, CORS, conexão recusada) também para gracioso.
export const ERRO_REDE: StatusKind = "error";
