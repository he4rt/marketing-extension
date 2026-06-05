// Barra de ações por plataforma: info à esquerda (contagem) + Exportar/Raw/Limpar.
// Mesmas ações do popup (GET_EXPORT / GET_RAW_PAYLOADS / CLEAR_ALL).

import type { ComponentChildren } from "preact";
import type { SocialProvider } from "../../shared/domain";
import { clearAll, exportPlatform, exportRaw } from "../lib/actions";
import { IconBtn } from "./IconBtn";

export function Toolbar({
  info,
  provider,
  disabled,
}: {
  info: ComponentChildren;
  provider: SocialProvider;
  disabled: boolean;
}) {
  return (
    <div class="flex items-center justify-between px-4 pb-3 pt-3.5">
      <div class="min-w-0">{info}</div>
      <div class="flex gap-1.5">
        <IconBtn solid disabled={disabled} onClick={() => void exportPlatform(provider)}>
          Exportar
        </IconBtn>
        <IconBtn disabled={disabled} onClick={() => void exportRaw(provider)}>
          Raw
        </IconBtn>
        <IconBtn warn disabled={disabled} onClick={() => void clearAll()}>
          Limpar
        </IconBtn>
      </div>
    </div>
  );
}

// Contagem grande + substantivo + sub-linha opcional (ex.: "M ilegíveis").
export function CountInfo({ n, noun, sub }: { n: number; noun: string; sub?: string }) {
  return (
    <div>
      <div class="text-xs">
        <b class="font-mono text-[18px] font-semibold tracking-tight text-ink">{n}</b>{" "}
        <span class="text-ink-3">{noun}</span>
      </div>
      {sub && <div class="font-mono text-[10px] text-ink-3">{sub}</div>}
    </div>
  );
}
