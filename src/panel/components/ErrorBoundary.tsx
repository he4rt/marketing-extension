// Error boundary do conteúdo. Sem isto, um throw durante o render corrompe a árvore do
// Preact e a navegação seguinte DUPLICA o painel (bug observado no detalhe do LinkedIn).
// Com o boundary, o erro é contido e mostramos um fallback com "voltar".

import type { ComponentChildren } from "preact";
import { useErrorBoundary } from "preact/hooks";
import { closeDetail } from "../state/store";

export function ErrorBoundary({ children }: { children: ComponentChildren }) {
  const [error, reset] = useErrorBoundary();
  if (error) {
    return (
      <div class="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
        <p class="text-sm text-ink">Algo quebrou ao renderizar esta tela.</p>
        <button
          type="button"
          onClick={() => {
            closeDetail();
            reset();
          }}
          class="rounded-lg border border-line-2 px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink"
        >
          voltar
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
