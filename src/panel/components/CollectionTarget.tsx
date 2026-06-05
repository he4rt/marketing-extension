// Banner do Collection Target (#9): mostra o perfil detectado na aba do navegador ativa e
// oferece "Rastrear". Só aparece na aba do painel correspondente ao provider detectado.

import { metaFor } from "../../providers/meta";
import { activeTab, detected } from "../state/store";
import { trackTarget } from "../state/sync";

export function CollectionTarget() {
  const d = detected.value;
  if (!d || activeTab.value !== d.provider) return null;

  const meta = metaFor(d.provider);
  const color = meta?.color ?? "#888";
  const label = meta?.name ?? d.provider;
  const tracked = (d.handles[d.provider] || "").toLowerCase() === d.target.toLowerCase();

  return (
    <div class="mx-3.5 mt-3 flex items-center gap-2.5 rounded-xl border border-accent/20 bg-accent-soft px-3 py-2 text-xs">
      <span class="size-2 shrink-0 rounded-full" style={{ background: color }} />
      {tracked ? (
        <span class="flex-1 text-ink-2">
          Coletando <b class="text-ink">{d.target}</b> no {label} · modo Profile
        </span>
      ) : (
        <>
          <span class="flex-1 text-ink-2">
            Perfil detectado: <b class="text-ink">{d.target}</b>
          </span>
          <button
            type="button"
            onClick={() => void trackTarget(d.provider, d.target)}
            class="rounded-full border border-accent/30 px-2.5 py-1 font-mono text-[9.5px] text-accent"
          >
            Rastrear
          </button>
        </>
      )}
    </div>
  );
}
