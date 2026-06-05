// Estado reativo do painel (Preact Signals). Substitui o re-render manual do popup:
// o broadcast STORE_UPDATED chama refreshActive() e o signal alterado re-renderiza só o
// que mudou. Mesmo protocolo de mensagens — o background é intocado.

import { signal } from "@preact/signals";
import type {
  LinkedInPostData,
  SocialComment,
  SocialEngagement,
  SocialProvider,
  SocialPublication,
} from "../../shared/domain";
import type { AllSummaryResponse, HandlesResponse } from "../../shared/messages";
import type { EngagerCount } from "../features/linkedin-discovery/engagers";
import { send } from "./bridge";

// Shape REAL de um post no GET_PLATFORM_DATA do LinkedIn (≠ ExportLinkedInPost do export v3):
// é o LinkedInPostData + um resumo {captured,total} por categoria de engajador. As LISTAS de
// usuários NÃO vêm nesta resposta — só os contadores.
export type LinkedInPanelPost = LinkedInPostData & {
  engagers: { reactions: EngagerCount; reposts: EngagerCount; comments: EngagerCount };
};

export type TabId = SocialProvider | "all" | "config";
export type HandlesMap = Partial<Record<SocialProvider, string>>;

// Resposta de GET_PLATFORM_DATA para X/Instagram (shape normalizado).
export type ProviderData = {
  type: SocialProvider;
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
};

// Resposta de GET_PLATFORM_DATA para o LinkedIn (descoberta SDUI: lista de posts + sinais).
export type LinkedInProviderData = {
  type: "linkedin";
  content: LinkedInPanelPost[];
  lastUpdated: string | null;
  unreadable?: number;
  calibrated?: boolean;
};

export type AnyProviderData = LinkedInProviderData | ProviderData;

// Alvo de coleta detectado a partir da aba do navegador ativa (Collection Target #9).
export type DetectedTarget = { provider: SocialProvider; target: string; handles: HandlesMap };

// --- Signals (fonte única reativa) ---
export const activeTab = signal<TabId>("all");
export const handles = signal<HandlesMap>({});
export const providerData = signal<Partial<Record<SocialProvider, AnyProviderData>>>({});
export const summary = signal<AllSummaryResponse | null>(null);
export const detected = signal<DetectedTarget | null>(null);

// Item aberto em detalhe (comentários/engajadores). null = visão de lista.
export type Selected = { provider: SocialProvider; id: string } | null;
export const selected = signal<Selected>(null);

// Carregando a aba ativa — o spinner só aparece no primeiro load (loading && sem dados).
export const loading = signal(false);

export function openDetail(provider: SocialProvider, id: string): void {
  selected.value = { provider, id };
}

export function closeDetail(): void {
  selected.value = null;
}

// --- Refresh (cada um atualiza um signal; a UI reage) ---
export async function refreshHandles(): Promise<void> {
  const res = await send<HandlesResponse | undefined>({ action: "GET_HANDLES" });
  handles.value = res?.handles ?? {};
}

export async function refreshPlatform(provider: SocialProvider): Promise<void> {
  const data = await send<AnyProviderData | undefined>({ action: "GET_PLATFORM_DATA", provider });
  if (data) providerData.value = { ...providerData.value, [provider]: data };
}

export async function refreshSummary(): Promise<void> {
  summary.value =
    (await send<AllSummaryResponse | undefined>({ action: "GET_ALL_SUMMARY" })) ?? null;
}

// Reatualiza só a aba ativa (chamado no STORE_UPDATED e ao trocar de aba).
export async function refreshActive(): Promise<void> {
  const tab = activeTab.value;
  loading.value = true;
  try {
    if (tab === "all") await refreshSummary();
    else if (tab === "config") await refreshHandles();
    else await refreshPlatform(tab);
  } finally {
    loading.value = false;
  }
}

export function setActiveTab(tab: TabId): void {
  selected.value = null; // trocar de aba fecha qualquer detalhe aberto
  activeTab.value = tab;
  void refreshActive();
}
