// Aba Config: perfis monitorados. Edita um rascunho local e salva via SET_HANDLES
// (mesma ação do popup, que limpa + reprocessa no background).

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { send } from "../state/bridge";
import { type HandlesMap, handles, refreshHandles } from "../state/store";

const FIELDS = [
  { id: "x", label: "X", color: "text-x", ph: "usuario" },
  { id: "instagram", label: "Instagram", color: "text-ig", ph: "usuario" },
  { id: "linkedin", label: "LinkedIn", color: "text-li", ph: "empresa ou perfil" },
] as const;

export function ConfigPanel() {
  const draft = useSignal<HandlesMap>({});
  const saving = useSignal(false);

  // Reidrata o rascunho quando os handles chegam do background.
  useEffect(() => {
    draft.value = { ...handles.value };
  }, [handles.value]);

  async function save() {
    const clean: HandlesMap = {};
    for (const f of FIELDS) {
      const v = (draft.value[f.id] || "").trim().replace(/^@/, "");
      if (v) clean[f.id] = v;
    }
    saving.value = true;
    await send({ action: "SET_HANDLES", handles: clean });
    await refreshHandles();
    saving.value = false;
  }

  return (
    <div class="flex-1 overflow-y-auto px-4 py-3">
      <h3 class="mb-3 mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        Perfis monitorados
      </h3>
      {FIELDS.map((f) => (
        <div
          key={f.id}
          class="mb-2 flex items-center gap-2.5 rounded-xl border border-line-2 bg-card py-0.5 pl-3.5 pr-1.5"
        >
          <span class={`min-w-[64px] text-xs font-semibold ${f.color}`}>{f.label}</span>
          <span class="font-mono text-ink-3">@</span>
          <input
            class="w-full bg-transparent py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-3"
            placeholder={f.ph}
            spellcheck={false}
            value={draft.value[f.id] ?? ""}
            onInput={(e) => {
              draft.value = { ...draft.value, [f.id]: (e.target as HTMLInputElement).value };
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving.value}
        class="mt-1 w-full rounded-lg border border-ink bg-ink px-3 py-2.5 text-xs font-semibold text-paper transition-colors hover:border-accent hover:bg-accent disabled:opacity-60"
      >
        {saving.value ? "Salvo!" : "Salvar perfis"}
      </button>
    </div>
  );
}
