// Casca da visão de detalhe: header com "voltar" (fecha o detalhe) + área rolável.
// Os componentes de detalhe (PublicationDetail/LinkedInDetail) renderizam só o corpo.

import type { ComponentChildren } from "preact";
import { closeDetail } from "../../state/store";

export function DetailShell({ children }: { children: ComponentChildren }) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="px-3.5 pb-2 pt-3">
        <button
          type="button"
          onClick={closeDetail}
          class="flex items-center gap-1.5 rounded-lg border border-line-2 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink"
        >
          ← voltar
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-3.5 pb-4">{children}</div>
    </div>
  );
}
