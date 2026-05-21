export type GraphqlCapturedMessage = {
  action: "GRAPHQL_CAPTURED";
  endpoint: string;
  pageUrl?: string;
  payload: unknown;
  timestamp: string;
  url?: string;
};

export type SetHandleMessage = {
  action: "SET_HANDLE";
  handle: string;
};

export type GetHandleMessage = {
  action: "GET_HANDLE";
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

export type RuntimeMessage =
  | GraphqlCapturedMessage
  | SetHandleMessage
  | GetHandleMessage
  | GetTweetsMessage
  | GetExportMessage
  | GetEndpointsMessage
  | GetEndpointPayloadsMessage
  | GetAllRawMessage
  | ClearAllMessage;

export type PageGraphqlMessage = {
  endpoint: string;
  payload: unknown;
  type: "X_GRAPHQL_RESPONSE";
  url?: string;
};
