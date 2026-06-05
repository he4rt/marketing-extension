import type { ComponentChildren } from "preact";

// Botão de ação do painel. Variantes: solid (ação primária, vira coral no hover),
// warn (destrutivo, traço coral) e o default (outline discreto).
export function IconBtn({
  children,
  onClick,
  disabled,
  solid,
  warn,
}: {
  children: ComponentChildren;
  onClick: () => void;
  disabled?: boolean;
  solid?: boolean;
  warn?: boolean;
}) {
  const base =
    "rounded-lg border px-3 py-[7px] text-[11.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variant = solid
    ? "border-ink bg-ink text-paper hover:border-accent hover:bg-accent"
    : warn
      ? "border-accent/25 text-accent hover:border-accent"
      : "border-line-2 text-ink-2 hover:border-ink hover:text-ink";
  return (
    <button type="button" onClick={onClick} disabled={disabled} class={`${base} ${variant}`}>
      {children}
    </button>
  );
}
