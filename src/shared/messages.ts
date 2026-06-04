import type { EndpointStore, NormalizedStore, SocialProvider } from "./domain";

export type CapturedPayloadMessage = {
  action: "CAPTURED_PAYLOAD";
  endpoint: string;
  pageUrl?: string;
  payload: unknown;
  provider: SocialProvider;
  timestamp: string;
  url?: string;
};

export type GraphqlCapturedMessage = Omit<CapturedPayloadMessage, "action" | "provider"> & {
  action: "GRAPHQL_CAPTURED";
  provider?: SocialProvider;
};

export type SetHandleMessage = {
  action: "SET_HANDLE";
  handle: string;
  pageUrl?: string;
  provider?: null | SocialProvider;
};

export type GetHandleMessage = {
  action: "GET_HANDLE";
  provider?: null | SocialProvider;
};

export type GetPublicationsMessage = {
  action: "GET_PUBLICATIONS";
  provider?: null | SocialProvider;
};

export type GetTweetsMessage = {
  action: "GET_TWEETS";
  provider?: null | SocialProvider;
};

export type GetExportMessage = {
  action: "GET_EXPORT";
  provider?: null | SocialProvider;
};

export type GetEndpointsMessage = {
  action: "GET_ENDPOINTS";
  provider?: null | SocialProvider;
};

export type GetEndpointPayloadsMessage = {
  action: "GET_ENDPOINT_PAYLOADS";
  endpoint: string;
};

export type GetAllRawMessage = {
  action: "GET_ALL_RAW";
  provider?: null | SocialProvider;
};

export type ClearAllMessage = {
  action: "CLEAR_ALL";
};

export type PageSessionStartedMessage = {
  action: "PAGE_SESSION_STARTED";
  pageUrl: string;
  provider: SocialProvider;
  sessionKey: string;
};

export type SetActiveProviderMessage = {
  action: "SET_ACTIVE_PROVIDER";
  pageUrl?: string;
  provider: null | SocialProvider;
};

export type VisiblePublicationsMessage = {
  action: "VISIBLE_PUBLICATIONS";
  items?: Array<{
    author?: { avatar_url?: string; name?: string; username?: string };
    mediaType?: "carousel" | "image" | "reel" | "unknown" | "video";
    metrics?: { comment_count?: number; like_count?: number };
    shortcode: string;
    text?: string;
    url: string;
  }>;
  pageUrl: string;
  provider: Extract<SocialProvider, "instagram">;
  shortcodes: string[];
};

export type VisibleCommentsMessage = {
  action: "VISIBLE_COMMENTS";
  captured_at: string;
  comments: Array<{
    author: { avatar_url?: string; name?: string; provider_user_id?: string; username: string };
    comment_id: string;
    like_count?: number;
    parent_comment_id?: null | string;
    publication_shortcode: string;
    relative_created_at?: string;
    source?: string;
    text: string;
  }>;
  pageUrl: string;
  provider: Extract<SocialProvider, "instagram">;
  publication_shortcode: string;
};

// --- New messages for multi-platform popup ---

export type GetPlatformDataMessage = {
  action: "GET_PLATFORM_DATA";
  provider: SocialProvider;
};

export type PlatformDataResponse = {
  type: "x" | "instagram" | "linkedin";
  // #18: sinais de UX exclusivos do LinkedIn (busca SDUI + calibração do Active Fetch).
  // Opcionais — ausentes para X/Instagram, que não os consomem (retrocompatível).
  // `unreadable`: nós SDUI em drift acumulados na descoberta ("M ilegíveis (parser drift)").
  // `calibrated`: assinatura Voyager colhida o suficiente p/ habilitar o botão L3.
  unreadable?: number;
  calibrated?: boolean;
} & NormalizedStore;

export type GetAllSummaryMessage = {
  action: "GET_ALL_SUMMARY";
};

export type AllSummaryResponse = {
  total_content: number;
  total_engagers: number;
  by_platform: Record<string, { content_count: number; engager_count: number }>;
  lastUpdated: string | null;
};

export type SetHandlesMessage = {
  action: "SET_HANDLES";
  handles: Partial<Record<SocialProvider, string>>;
};

export type GetHandlesMessage = {
  action: "GET_HANDLES";
};

export type HandlesResponse = {
  handles: Partial<Record<SocialProvider, string>>;
};

export type GetRawPayloadsMessage = {
  action: "GET_RAW_PAYLOADS";
  provider?: SocialProvider;
};

export type RawPayloadsResponse = {
  endpoints: Record<string, EndpointStore>;
};

// Collection Target (#9): o popup pergunta ao background qual alvo a URL da aba ativa
// sugere, via o detectFromPage do scopeModes.profile do provider.
export type DetectTargetMessage = {
  action: "DETECT_TARGET";
  pageUrl: string;
  provider: SocialProvider;
};

export type DetectTargetResponse = {
  mode: string;
  target: null | string;
};

// Active Fetch (L3) — #16/#17. Aprofundamento on-demand do engajamento dos posts
// descobertos na busca. RUN dispara o scheduler (fan-out sequencial) e devolve o status
// inicial; GET é o polling do andamento. A resposta de AMBOS é `ActiveFetchStatus`
// (src/background/active-fetch.ts) — o popup lê running/total/done/actorsCaptured/error.
export type RunActiveFetchMessage = {
  action: "RUN_ACTIVE_FETCH";
  provider: SocialProvider;
};

export type GetActiveFetchStatusMessage = {
  action: "GET_ACTIVE_FETCH_STATUS";
  provider: SocialProvider;
};

// Status/progresso do fan-out — duplicado da definição canônica em
// src/background/active-fetch.ts para o popup tipar a resposta sem importar do background.
export type ActiveFetchStatusResponse = {
  running: boolean;
  total: number; // alvos × endpoints calibrados (planejados antes do fan-out)
  done: number; // requisições concluídas (sucesso ou pulo)
  actorsCaptured: number; // Actors novos consolidados durante o run
  startedAt: string | null;
  finishedAt: string | null;
  error?: string; // "uncalibrated" | "session_expired" | "rate_limited" | "error"
};

export type RuntimeMessage =
  | CapturedPayloadMessage
  | GraphqlCapturedMessage
  | SetHandleMessage
  | GetHandleMessage
  | GetPublicationsMessage
  | GetTweetsMessage
  | GetExportMessage
  | GetEndpointsMessage
  | GetEndpointPayloadsMessage
  | GetAllRawMessage
  | ClearAllMessage
  | PageSessionStartedMessage
  | SetActiveProviderMessage
  | VisiblePublicationsMessage
  | VisibleCommentsMessage
  | GetPlatformDataMessage
  | GetAllSummaryMessage
  | SetHandlesMessage
  | GetHandlesMessage
  | GetRawPayloadsMessage
  | DetectTargetMessage
  | RunActiveFetchMessage
  | GetActiveFetchStatusMessage;

export type PageCapturedMessage = {
  endpoint: string;
  payload: unknown;
  provider: SocialProvider;
  type: "SOCIAL_CAPTURED";
  url?: string;
};

export type PageGraphqlMessage = {
  endpoint: string;
  payload: unknown;
  type: "X_GRAPHQL_RESPONSE";
  url?: string;
};
