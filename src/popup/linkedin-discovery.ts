// Cabeçalho de descoberta do LinkedIn no popup (#14).
//
// Contexto: a busca SDUI (Estágio 1) descobre N posts e pode encontrar M nós em "drift"
// (shape irreconhecível pelo parser) — os "ilegíveis". Este módulo renderiza a contagem
// de descobertos e deixa pontos de extensão prontos para o que vem depois:
//   - a sub-linha "M ilegíveis" (sinal de saúde do parser SDUI) — #18;
//   - o botão "Aprofundar (L3)" (Active Fetch), habilitado só quando calibrado — #18.
//
// Mantido FORA de popup/index.ts (arquivo legado grande) e pequeno/coeso (≤150 linhas),
// chamado de renderLinkedIn. Defensivo: campos opcionais ausentes → estado neutro,
// preservando o comportamento atual (só "N publicações") até #18 ligar os campos.

// Sinais opcionais da resposta GET_PLATFORM_DATA do LinkedIn. Hoje só `content` chega;
// `unreadable`/`calibrated` entram em #18 (controller). Lemos defensivamente para que o
// ponto de extensão já exista sem acoplar #14 a essas mudanças.
export type LinkedInDiscoverySignals = {
  // Total de posts descobertos pela busca (= itens consolidados no store).
  discovered: number;
  // Nós em drift que o parser SDUI não reconheceu. undefined enquanto #18 não envia.
  unreadable?: number;
  // Assinatura Voyager colhida o suficiente p/ habilitar o Active Fetch. undefined = desconhecido.
  calibrated?: boolean;
};

function plural(count: number, singular: string, pluralText: string): string {
  return count === 1 ? singular : pluralText;
}

// Monta o texto principal: "N posts descobertos" (semântica de busca, não "publicações").
export function discoveredLabel(discovered: number): string {
  return `${discovered} ${plural(discovered, "post descoberto", "posts descobertos")}`;
}

// Monta a sub-linha de ilegíveis; "" quando não há sinal ou zero ilegíveis (esconde a linha).
export function unreadableLabel(unreadable: number | undefined): string {
  if (!unreadable || unreadable <= 0) return "";
  return `${unreadable} ${plural(unreadable, "ilegível", "ilegíveis")} (parser drift)`;
}

type DiscoveryEls = {
  count: HTMLElement;
  sub: HTMLElement;
  deepenBtn: HTMLButtonElement | null;
};

function resolveEls(doc: Document): DiscoveryEls | null {
  const count = doc.getElementById("liPublicationCount");
  const sub = doc.getElementById("liDiscoveredSub");
  if (!count || !sub) return null;
  return {
    count,
    sub,
    deepenBtn: doc.getElementById("liDeepenBtn") as HTMLButtonElement | null,
  };
}

// Renderiza o cabeçalho de descoberta do LinkedIn a partir dos sinais.
// Idempotente: pode ser chamado a cada refresh sem efeito colateral.
export function renderLinkedInDiscovery(
  signals: LinkedInDiscoverySignals,
  doc: Document = document,
): void {
  const els = resolveEls(doc);
  if (!els) return;

  els.count.textContent = discoveredLabel(signals.discovered);

  const subText = unreadableLabel(signals.unreadable);
  els.sub.textContent = subText;
  els.sub.classList.toggle("hidden", subText === "");

  // Ponto de extensão #18: o botão L3 só aparece quando há posts descobertos; fica
  // desabilitado enquanto a assinatura Voyager não foi calibrada (tooltip orienta o usuário).
  renderDeepenButton(els.deepenBtn, signals);
}

function renderDeepenButton(
  btn: HTMLButtonElement | null,
  signals: LinkedInDiscoverySignals,
): void {
  if (!btn) return;
  const hasDiscovered = signals.discovered > 0;
  btn.classList.toggle("hidden", !hasDiscovered);
  if (!hasDiscovered) return;

  // `calibrated === undefined` ainda significa "não habilitar" — só liga com sinal explícito.
  const calibrated = signals.calibrated === true;
  btn.disabled = !calibrated;
  btn.title = calibrated
    ? "Aprofundar engajamento (L3) dos posts descobertos"
    : "Abra um post uma vez para calibrar a sessão antes de aprofundar";
}
