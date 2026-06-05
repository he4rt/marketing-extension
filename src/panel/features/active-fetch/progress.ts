// Tradução pura do status do fan-out Active Fetch (L3) em texto — movida 1:1 de
// popup/active-fetch-control.ts. Sem DOM: testada isoladamente (test/panel).
//
// Defensivo: erro tem precedência sobre o modo; no dry-run nada é enviado, então o texto
// avisa explicitamente que ninguém foi acionado (gate de ToS, Step 4).

import type { ActiveFetchStatusResponse } from "../../../shared/messages";

// Mensagem genérica quando o código de erro não é reconhecido.
const FALLBACK_ERROR = "Falha ao aprofundar — tente novamente";

// Mapa de códigos de erro do scheduler → mensagem humana.
const ERROR_LABELS: Record<string, string> = {
  uncalibrated: "Abra um post uma vez para calibrar a sessão",
  session_expired: "Sessão expirada — recarregue o LinkedIn e tente de novo",
  rate_limited: "Limite de requisições atingido — tente mais tarde",
  error: FALLBACK_ERROR,
};

// "k/N · M Actors" enquanto roda; "✓ N aprofundados · M Actors" ao concluir;
// no dry-run, "planejados · dry-run (nada enviado)"; mensagem de erro quando houver.
export function progressLabel(status: ActiveFetchStatusResponse): string {
  if (status.error) return ERROR_LABELS[status.error] ?? FALLBACK_ERROR;
  if (status.dryRun) {
    if (status.running) return `Simulando ${status.done}/${status.total}…`;
    if (status.finishedAt) {
      return `✓ ${status.done}/${status.total} planejados · dry-run (nada enviado)`;
    }
    return "";
  }
  const actors = `${status.actorsCaptured} ${status.actorsCaptured === 1 ? "Actor" : "Actors"}`;
  if (status.running) return `Aprofundando ${status.done}/${status.total} · ${actors}`;
  if (status.finishedAt) return `✓ ${status.done}/${status.total} aprofundados · ${actors}`;
  return "";
}
