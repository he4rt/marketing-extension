import type { PageGraphqlMessage } from "../shared/messages";

const GRAPHQL_PATH = "/i/api/graphql/";

function extractEndpointName(url: string) {
  const idx = url.indexOf(GRAPHQL_PATH);
  if (idx === -1) return null;
  const after = url.substring(idx + GRAPHQL_PATH.length);
  const parts = after.split("/");
  if (parts.length < 2) return null;
  const endpointWithParams = parts[1];
  return endpointWithParams?.split("?")[0] || null;
}

function postPayload(endpoint: string, url: string, payload: unknown) {
  window.postMessage(
    {
      type: "X_GRAPHQL_RESPONSE",
      endpoint,
      url,
      payload,
    } satisfies PageGraphqlMessage,
    "*",
  );
}

const originalFetch = window.fetch;
window.fetch = function patchedFetch(this: typeof window, ...args: Parameters<typeof fetch>) {
  const [resource] = args;
  const url =
    typeof resource === "string"
      ? resource
      : resource instanceof Request
        ? resource.url
        : String(resource || "");
  const endpoint = extractEndpointName(url);

  if (endpoint) {
    return originalFetch.apply(this, args).then(async (response) => {
      try {
        const clone = response.clone();
        const data = await clone.json();
        postPayload(endpoint, url, data);
      } catch {}
      return response;
    });
  }

  return originalFetch.apply(this, args);
} as typeof fetch;

const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

type CapturedXMLHttpRequest = XMLHttpRequest & {
  _endpoint?: null | string;
  _url?: string;
};

XMLHttpRequest.prototype.open = function patchedOpen(
  this: CapturedXMLHttpRequest,
  method: string,
  url: string | URL,
  async: boolean = true,
  username?: null | string,
  password?: null | string,
) {
  const urlString = String(url);
  this._url = urlString;
  this._endpoint = extractEndpointName(urlString);
  return originalXHROpen.call(this, method, url, async, username ?? null, password ?? null);
};

XMLHttpRequest.prototype.send = function patchedSend(this: CapturedXMLHttpRequest, ...args) {
  if (this._endpoint) {
    const endpoint = this._endpoint;
    const url = this._url || "";
    this.addEventListener("load", function onLoad() {
      try {
        const data = JSON.parse(this.responseText);
        postPayload(endpoint, url, data);
      } catch {}
    });
  }
  return originalXHRSend.apply(this, args);
};
