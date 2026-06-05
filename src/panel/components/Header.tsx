import { theme, toggleTheme } from "../state/theme";

// Cabeçalho do painel: marca He4rt + status "ao vivo" (ponto pulsante) — o painel fica
// aberto e captura em tempo real, então o status comunica isso — + toggle de tema.
export function Header() {
  return (
    <header class="flex items-center gap-2.5 border-b border-line px-4 py-3">
      <div class="grid size-7 place-items-center rounded-lg bg-accent font-display text-[15px] text-white">
        h
      </div>
      <div class="leading-tight">
        <div class="font-display text-[17px] tracking-tight">He4rt Analytics</div>
        <div class="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">side panel</div>
      </div>
      <div class="ml-auto flex items-center gap-2.5">
        <span class="flex items-center gap-1.5 font-mono text-[10px] text-ok">
          <span class="he4rt-pulse inline-block size-[7px] rounded-full bg-ok" />
          ao vivo
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Alternar tema claro/escuro"
          title="Alternar tema claro/escuro"
          class="grid size-7 place-items-center rounded-lg border border-line text-sm text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
        >
          {theme.value === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}
