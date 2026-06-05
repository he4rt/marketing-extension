// Sincronização do painel com o navegador: auto-seleção da aba pelo host ativo,
// detecção do Collection Target (#9) e a escuta do broadcast STORE_UPDATED. Mantém o
// painel "vivo" enquanto o usuário navega — a grande vantagem sobre o popup.

import { PROVIDER_METAS } from "../../providers/meta";
import type { SocialProvider } from "../../shared/domain";
import type { DetectTargetResponse, HandlesResponse } from "../../shared/messages";
import { activeTabUrl, send } from "./bridge";
import { detected, refreshActive, refreshPlatform, setActiveTab } from "./store";

// host → tab, derivado do registry (provider-agnóstico, igual ao popup).
const HOST_TAB_MAP = PROVIDER_METAS.flatMap((meta) =>
  meta.hosts.map((host) => ({ host, provider: meta.id })),
);

function providerFromUrl(url: string): SocialProvider | null {
  for (const { host, provider } of HOST_TAB_MAP) {
    if (url.includes(host)) return provider;
  }
  return null;
}

// Seleciona a aba do painel a partir do host da aba do navegador; cai em "Resumo".
async function autoSelectTab(): Promise<void> {
  const url = await activeTabUrl();
  const provider = url ? providerFromUrl(url) : null;
  setActiveTab(provider ?? "all");
}

// Pergunta ao background qual alvo a URL sugere e guarda o resultado + handles atuais.
async function detectTarget(): Promise<void> {
  const url = await activeTabUrl();
  const provider = url ? providerFromUrl(url) : null;
  if (!url || !provider) {
    detected.value = null;
    return;
  }
  const res = await send<DetectTargetResponse | undefined>({
    action: "DETECT_TARGET",
    provider,
    pageUrl: url,
  });
  const target = res?.target ?? null;
  if (!target) {
    detected.value = null;
    return;
  }
  const handlesRes = await send<HandlesResponse | undefined>({ action: "GET_HANDLES" });
  detected.value = { provider, target, handles: handlesRes?.handles ?? {} };
}

// Passa a rastrear o alvo detectado (botão "Rastrear" do banner). Limpa+reprocessa no
// background; aqui só reidratamos o estado da aba afetada.
export async function trackTarget(provider: SocialProvider, target: string): Promise<void> {
  const merged = { ...(detected.value?.handles ?? {}), [provider]: target };
  await send({ action: "SET_HANDLES", handles: merged });
  await detectTarget();
  await refreshPlatform(provider);
}

// Liga os listeners uma vez no bootstrap do painel.
export function initSync(): void {
  chrome.runtime.onMessage.addListener((m: { action?: string }) => {
    if (m.action === "STORE_UPDATED") void refreshActive();
  });
  chrome.tabs.onActivated?.addListener(() => {
    void autoSelectTab();
    void detectTarget();
  });
  chrome.tabs.onUpdated?.addListener((_id, info) => {
    if (info.status === "complete" || info.url) {
      void autoSelectTab();
      void detectTarget();
    }
  });
  void autoSelectTab();
  void detectTarget();
}
