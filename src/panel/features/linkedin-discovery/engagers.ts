// Resumo de engajadores do LinkedIn como o GET_PLATFORM_DATA realmente entrega: NÃO são
// as listas de usuários (essas só vão no export v3), e sim contadores {captured, total}.
// (controller.ts monta engagers.reactions = { captured, total }). Tipar isso corretamente
// faz o TypeScript pegar qualquer `.map`/`.length` indevido — a regressão que duplicava o app.

export type EngagerCount = { captured: number; total: number };

// "12" quando capturamos tudo que conhecemos; "12/40" quando o total é maior que o capturado.
export function engagerSummary(count: EngagerCount | undefined): string {
  if (!count) return "0";
  return count.total > count.captured ? `${count.captured}/${count.total}` : `${count.captured}`;
}
