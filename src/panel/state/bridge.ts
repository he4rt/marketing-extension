// Ponte de mensagens painel → background. Mesmo protocolo do popup legado
// (shared/messages.ts) — o background não percebe diferença. `send` envolve
// chrome.runtime.sendMessage numa Promise para casar com o fluxo reativo dos signals.

export function send<T>(msg: unknown): Promise<T> {
  return new Promise<T>((resolve) => {
    chrome.runtime.sendMessage(msg, (res: T) => resolve(res));
  });
}

// URL da aba do navegador ativa (para auto-seleção e Collection Target). Resolve null
// quando não há aba/URL acessível.
export function activeTabUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.url ?? null);
    });
  });
}
