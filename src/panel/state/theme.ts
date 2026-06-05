// Tema claro/escuro persistente. Aplica em <html data-theme="…"> — o CSS sobrescreve os
// tokens (--color-*) nesse escopo, então toda a UI adapta sem `dark:` por classe.
// Persistido em chrome.storage.local (permissão "storage" já existe).

import { signal } from "@preact/signals";

export type Theme = "dark" | "light";

const STORAGE_KEY = "he4rt_theme";

export const theme = signal<Theme>("light");

function apply(value: Theme): void {
  document.documentElement.dataset.theme = value;
}

// Lê a preferência salva e aplica. Aplica o default na hora para evitar flash até o
// storage (assíncrono) responder.
export function initTheme(): void {
  apply(theme.value);
  chrome.storage?.local.get(STORAGE_KEY, (res) => {
    const stored = res?.[STORAGE_KEY];
    const value: Theme = stored === "dark" || stored === "light" ? stored : "light";
    theme.value = value;
    apply(value);
  });
}

export function toggleTheme(): void {
  const value: Theme = theme.value === "dark" ? "light" : "dark";
  theme.value = value;
  apply(value);
  chrome.storage?.local.set({ [STORAGE_KEY]: value });
}
