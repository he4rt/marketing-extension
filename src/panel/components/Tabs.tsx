// Abas do painel — derivadas de PROVIDER_METAS (provider-agnóstico, igual ao popup) +
// "Resumo" e "Config". Adicionar uma rede nova faz a aba aparecer sozinha (ADR-0002).

import { PROVIDER_METAS } from "../../providers/meta";
import { activeTab, setActiveTab, type TabId } from "../state/store";

const TABS: Array<{ id: TabId; label: string }> = [
  ...PROVIDER_METAS.map((meta) => ({ id: meta.id as TabId, label: meta.name })),
  { id: "all", label: "Resumo" },
  { id: "config", label: "Config" },
];

export function Tabs() {
  const current = activeTab.value;
  return (
    <nav class="flex gap-0.5 px-3.5 pt-3">
      {TABS.map((tab) => {
        const on = current === tab.id;
        return (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            class={`relative flex-1 rounded-t-lg px-1 py-2 text-xs font-semibold transition-colors ${
              on ? "text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {tab.label}
            {on && <span class="absolute inset-x-[18%] -bottom-px h-0.5 rounded bg-accent" />}
          </button>
        );
      })}
    </nav>
  );
}
