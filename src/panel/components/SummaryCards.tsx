// Aba Resumo: total unificado + um card por rede + export agregado (provider null).

import { exportPlatform, exportRaw } from "../lib/actions";
import { summary } from "../state/store";
import { IconBtn } from "./IconBtn";

const PLATS = [
  { id: "x", label: "X", color: "text-x" },
  { id: "instagram", label: "Instagram", color: "text-ig" },
  { id: "linkedin", label: "LinkedIn", color: "text-li" },
] as const;

export function SummaryCards() {
  const s = summary.value;
  const total = s?.total_content ?? 0;
  const count = (id: string) => s?.by_platform?.[id]?.content_count ?? 0;

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div class="mx-3.5 mt-3 flex items-baseline gap-3 rounded-2xl bg-ink p-4 text-paper">
        <b class="font-display text-[38px] leading-none tracking-tight">{total}</b>
        <span class="text-xs text-paper-2">
          publicações
          <br />
          consolidadas
        </span>
      </div>
      <div class="grid grid-cols-3 gap-2 px-3.5 py-3.5">
        {PLATS.map((p) => (
          <div key={p.id} class="rounded-xl border border-line bg-card p-3 text-center shadow-sm">
            <div class={`font-mono text-[9px] font-semibold uppercase tracking-wide ${p.color}`}>
              {p.label}
            </div>
            <div class="my-0.5 font-display text-[30px] leading-tight tracking-tight">
              {count(p.id)}
            </div>
            <div class="text-[10px] text-ink-3">posts</div>
          </div>
        ))}
      </div>
      <div class="flex items-center justify-between px-4 pb-4">
        <span class="text-[11px] text-ink-3">Export unificado</span>
        <div class="flex gap-1.5">
          <IconBtn solid onClick={() => void exportPlatform(null)}>
            Exportar tudo
          </IconBtn>
          <IconBtn onClick={() => void exportRaw(null)}>Raw</IconBtn>
        </div>
      </div>
      {total === 0 && (
        <p class="px-4 py-6 text-center text-sm text-ink-3">
          Nenhum dado capturado em nenhuma plataforma.
        </p>
      )}
    </div>
  );
}
