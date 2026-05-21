import type { PageGraphqlMessage } from "../shared/messages";

window.addEventListener("message", (event: MessageEvent<PageGraphqlMessage>) => {
  if (event.source !== window) return;
  if (event.data.type === "X_GRAPHQL_RESPONSE") {
    chrome.runtime.sendMessage({
      action: "GRAPHQL_CAPTURED",
      endpoint: event.data.endpoint,
      url: event.data.url,
      payload: event.data.payload,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
    });
  }
});
