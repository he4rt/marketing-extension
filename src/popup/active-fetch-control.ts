// Controle do Active Fetch (L3) no popup (#16).
//
// Contexto: a descoberta (Estágio 1) lista os posts de uma busca; o aprofundamento
// (Estágio 2) é on-demand — o usuário clica "Aprofundar engajamento (L3)" e o background
// roda um fan-out sequencial (RUN_ACTIVE_FETCH). Este módulo liga o clique do botão à
// mensagem RUN e faz polling de GET_ACTIVE_FETCH_STATUS, refletindo o progresso "k/N · Actors"
// na sub-linha #liDeepenProgress. Mantido FORA de popup/index.ts (legado grande), pequeno e
// coeso (≤150 linhas), chamado uma única vez do setup do popup.
//
// Defensivo: sem alvos/sessão não calibrada → o background devolve status com `error`;
// o popup só exibe a mensagem amigável e reabilita o botão.

import type { ActiveFetchStatusResponse } from "../shared/messages";

// Intervalo de polling do andamento. O fan-out é sequencial e lento (delays anti-rate-limit),
// então não precisamos consultar com mais frequência que isso.
const POLL_INTERVAL_MS = 800;

// Mensagem genérica quando o código de erro não é reconhecido.
const FALLBACK_ERROR = "Falha ao aprofundar — tente novamente";

// Mapa de códigos de erro do scheduler → mensagem humana exibida na sub-linha.
const ERROR_LABELS: Record<string, string> = {
  uncalibrated: "Abra um post uma vez para calibrar a sessão",
  session_expired: "Sessão expirada — recarregue o LinkedIn e tente de novo",
  rate_limited: "Limite de requisições atingido — tente mais tarde",
  error: FALLBACK_ERROR,
};

type Els = {
  btn: HTMLButtonElement;
  progress: HTMLElement;
};

function resolveEls(doc: Document): Els | null {
  const btn = doc.getElementById("liDeepenBtn") as HTMLButtonElement | null;
  const progress = doc.getElementById("liDeepenProgress");
  if (!btn || !progress) return null;
  return { btn, progress };
}

// Texto de progresso a partir do status: "k/N · M Actors" enquanto roda;
// "✓ N aprofundados · M Actors" ao concluir; mensagem de erro quando houver.
export function progressLabel(status: ActiveFetchStatusResponse): string {
  if (status.error) return ERROR_LABELS[status.error] ?? FALLBACK_ERROR;
  const actors = `${status.actorsCaptured} ${status.actorsCaptured === 1 ? "Actor" : "Actors"}`;
  if (status.running) return `Aprofundando ${status.done}/${status.total} · ${actors}`;
  if (status.finishedAt) return `✓ ${status.done}/${status.total} aprofundados · ${actors}`;
  return "";
}

function showProgress(els: Els, status: ActiveFetchStatusResponse): void {
  const text = progressLabel(status);
  els.progress.textContent = text;
  els.progress.classList.toggle("hidden", text === "");
}

// Reflete o estado "rodando" no botão: desabilita e troca o rótulo enquanto o fan-out anda,
// reabilitando ao terminar (renderLinkedInDiscovery reavalia disabled no próximo refresh).
function setRunning(els: Els, running: boolean): void {
  els.btn.disabled = running;
  els.btn.textContent = running ? "Aprofundando…" : "Aprofundar engajamento (L3)";
}

type Messenger = (msg: unknown, cb: (res: ActiveFetchStatusResponse | undefined) => void) => void;

// Faz polling do status até `running` virar false (ou erro). Reusa a contagem `done/total`
// para o progresso. Defensivo: resposta ausente encerra o polling sem travar a UI.
function pollUntilDone(els: Els, send: Messenger): void {
  send({ action: "GET_ACTIVE_FETCH_STATUS", provider: "linkedin" }, (status) => {
    if (!status) {
      setRunning(els, false);
      return;
    }
    showProgress(els, status);
    if (status.running) {
      setTimeout(() => pollUntilDone(els, send), POLL_INTERVAL_MS);
      return;
    }
    setRunning(els, false);
  });
}

// Dispara o fan-out e inicia o polling. O background devolve o status inicial (já running
// ou já com erro de calibração); a partir dele decidimos se há o que poll-ar.
function startDeepen(els: Els, send: Messenger): void {
  setRunning(els, true);
  showProgress(els, {
    running: true,
    total: 0,
    done: 0,
    actorsCaptured: 0,
    startedAt: null,
    finishedAt: null,
  });
  send({ action: "RUN_ACTIVE_FETCH", provider: "linkedin" }, (status) => {
    if (!status) {
      setRunning(els, false);
      return;
    }
    showProgress(els, status);
    if (status.running) {
      pollUntilDone(els, send);
      return;
    }
    setRunning(els, false);
  });
}

// Liga o clique do botão L3 ao fan-out. Chamado uma vez no setup do popup; idempotência
// não é necessária (setup roda uma vez). `send` é injetável p/ testabilidade.
export function setupActiveFetchControl(
  doc: Document = document,
  send: Messenger = (msg, cb) => chrome.runtime.sendMessage(msg, cb),
): void {
  const els = resolveEls(doc);
  if (!els) return;
  els.btn.addEventListener("click", () => {
    if (els.btn.disabled) return;
    startDeepen(els, send);
  });
}
