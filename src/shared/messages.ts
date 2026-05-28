import type { SocialProvider } from "./domain";

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
};

export type GetHandleMessage = {
  action: "GET_HANDLE";
};

export type GetPublicationsMessage = {
  action: "GET_PUBLICATIONS";
};

export type GetTweetsMessage = {
  action: "GET_TWEETS";
};

export type GetExportMessage = {
  action: "GET_EXPORT";
};

export type GetEndpointsMessage = {
  action: "GET_ENDPOINTS";
};

export type GetEndpointPayloadsMessage = {
  action: "GET_ENDPOINT_PAYLOADS";
  endpoint: string;
};

export type GetAllRawMessage = {
  action: "GET_ALL_RAW";
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

export type VisiblePublicationsMessage = {
  action: "VISIBLE_PUBLICATIONS";
  items?: Array<{
    author?: {
      avatar_url?: string;
      name?: string;
      username?: string;
    };
    mediaType?: "carousel" | "image" | "reel" | "unknown" | "video";
    metrics?: {
      comment_count?: number;
      like_count?: number;
    };
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
    author: {
      avatar_url?: string;
      name?: string;
      provider_user_id?: string;
      username: string;
    };
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
  | VisiblePublicationsMessage
  | VisibleCommentsMessage;

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
