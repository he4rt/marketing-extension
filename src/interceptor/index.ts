import type { SocialProvider } from "../shared/domain";
import type { PageCapturedMessage } from "../shared/messages";

const X_GRAPHQL_PATH = "/i/api/graphql/";
const LINKEDIN_VOYAGER_PATH = "/voyager/api/graphql";

const LINKEDIN_ENDPOINT_MAP: Record<string, string> = {
  voyagerFeedDashOrganizationalPageUpdates: "feedDashOrganizationalPageUpdates",
  voyagerSocialDashReactions: "socialDashReactions",
  voyagerFeedDashReshareFeed: "feedDashReshareFeed",
  voyagerSocialDashComments: "socialDashComments",
};

const INSTAGRAM_MARKERS = [
  "xdt_api__v1__feed__timeline__connection",
  "xdt_api__v1__media__media_id__comments__connection",
  "xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection",
  '"like_count"',
  '"comment_count"',
  '"profile_pic_url"',
];

function providerFromUrl(url: string): null | SocialProvider {
  try {
    const host = new URL(url, window.location.href).hostname;
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com") return "x";
    if (host === "www.instagram.com" || host === "instagram.com") return "instagram";
    if (host === "www.linkedin.com" || host === "linkedin.com") return "linkedin";
  } catch {}
  return null;
}

function extractXEndpointName(url: string) {
  const idx = url.indexOf(X_GRAPHQL_PATH);
  if (idx === -1) return null;
  const after = url.substring(idx + X_GRAPHQL_PATH.length);
  const parts = after.split("/");
  if (parts.length < 2) return null;
  return parts[1]?.split("?")[0] || null;
}

function extractLinkedInEndpointName(url: string) {
  const idx = url.indexOf(LINKEDIN_VOYAGER_PATH);
  if (idx === -1) return null;
  try {
    const parsed = new URL(url, window.location.href);
    const queryId = parsed.searchParams.get("queryId");
    if (!queryId) return null;
    const prefix = queryId.split(".")[0] || "";
    return LINKEDIN_ENDPOINT_MAP[prefix] || prefix;
  } catch {
    return null;
  }
}

function extractInstagramEndpointName(url: string, body?: BodyInit | null) {
  const parsed = new URL(url, window.location.href);
  const bodyText = typeof body === "string" ? body : "";

  if (parsed.pathname === "/api/graphql" || parsed.pathname === "/graphql/query/") {
    const params = new URLSearchParams(bodyText || parsed.search);
    return (
      params.get("fb_api_req_friendly_name") ||
      params.get("doc_id") ||
      parsed.searchParams.get("doc_id") ||
      "InstagramGraphQL"
    );
  }

  if (parsed.pathname.includes("/api/v1/feed/timeline")) return "InstagramFeedTimeline";
  if (/\/api\/v1\/media\/[^/]+\/comments/.test(parsed.pathname)) return "InstagramComments";
  if (/\/api\/v1\/media\/[^/]+\/likers/.test(parsed.pathname)) return "InstagramLikers";
  if (/\/(?:p|reel|reels)\/[^/]+\/liked_by/.test(parsed.pathname)) return "InstagramLikedByPage";
  if (/\/(?:p|reel|reels)\/[^/]+/.test(parsed.pathname)) return "InstagramMediaPage";

  return null;
}

function inferInstagramEndpointFromPayload(payload: unknown, fallback: string) {
  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return fallback;
  }

  if (serialized.includes("xdt_api__v1__feed__timeline__connection")) {
    return "InstagramFeedTimeline";
  }
  if (
    serialized.includes("xdt_api__v1__media__media_id__comments__connection") ||
    serialized.includes(
      "xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection",
    )
  ) {
    return "InstagramComments";
  }
  if (serialized.includes('"profile_pic_url"') && serialized.includes('"username"')) {
    return fallback === "InstagramPayload" ? "InstagramLikers" : fallback;
  }
  if (serialized.includes('"like_count"') || serialized.includes('"comment_count"')) {
    return fallback === "InstagramPayload" ? "InstagramMedia" : fallback;
  }
  return fallback;
}

function shouldPostInstagramPayload(endpoint: string | null, payload: unknown) {
  if (endpoint) return true;
  try {
    const serialized = JSON.stringify(payload);
    return INSTAGRAM_MARKERS.some((marker) => serialized.includes(marker));
  } catch {
    return false;
  }
}

function postPayload(provider: SocialProvider, endpoint: string, url: string, payload: unknown) {
  console.log(`[He4rt Analytics] captura ${provider}:${endpoint}`);
  window.postMessage(
    {
      type: "SOCIAL_CAPTURED",
      provider,
      endpoint,
      url,
      payload,
    } satisfies PageCapturedMessage,
    "*",
  );
}

async function inspectResponse(
  provider: SocialProvider,
  endpoint: null | string,
  url: string,
  response: Response,
) {
  try {
    const clone = response.clone();
    const data = await clone.json();
    if (provider === "linkedin") {
      if (endpoint) postPayload(provider, endpoint, url, data);
      return;
    }
    if (provider === "instagram") {
      if (!shouldPostInstagramPayload(endpoint, data)) return;
      postPayload(
        provider,
        inferInstagramEndpointFromPayload(data, endpoint || "InstagramPayload"),
        url,
        data,
      );
      return;
    }
    if (endpoint) postPayload(provider, endpoint, url, data);
  } catch {}
}

const originalFetch = window.fetch;
window.fetch = function patchedFetch(this: typeof window, ...args: Parameters<typeof fetch>) {
  const [resource, init] = args;
  const url =
    typeof resource === "string"
      ? resource
      : resource instanceof Request
        ? resource.url
        : String(resource || "");
  const provider = providerFromUrl(url);

  if (provider) {
    const endpoint =
      provider === "x"
        ? extractXEndpointName(url)
        : provider === "linkedin"
          ? extractLinkedInEndpointName(url)
          : extractInstagramEndpointName(url, init?.body);
    if (endpoint || provider === "instagram") {
      return originalFetch.apply(this, args).then(async (response) => {
        await inspectResponse(provider, endpoint, url, response);
        return response;
      });
    }
  }

  return originalFetch.apply(this, args);
} as typeof fetch;

const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

type CapturedXMLHttpRequest = XMLHttpRequest & {
  _he4rtEndpoint?: null | string;
  _he4rtProvider?: null | SocialProvider;
  _he4rtUrl?: string;
};

XMLHttpRequest.prototype.open = function patchedOpen(
  this: CapturedXMLHttpRequest,
  method: string,
  url: string | URL,
  async: boolean = true,
  username?: null | string,
  password?: null | string,
) {
  const absoluteUrl = resolveUrl(url);
  const provider = providerFromUrl(absoluteUrl);
  this._he4rtUrl = absoluteUrl;
  this._he4rtProvider = provider;
  this._he4rtEndpoint =
    provider === "x"
      ? extractXEndpointName(absoluteUrl)
      : provider === "linkedin"
        ? extractLinkedInEndpointName(absoluteUrl)
        : provider === "instagram"
          ? extractInstagramEndpointName(absoluteUrl)
          : null;
  return originalXHROpen.call(this, method, url, async, username ?? null, password ?? null);
};

function resolveUrl(raw: string | URL): string {
  if (typeof raw === "string") {
    try {
      return new URL(raw, window.location.origin).href;
    } catch {
      return raw;
    }
  }
  return raw.href;
}

XMLHttpRequest.prototype.send = function patchedSend(this: CapturedXMLHttpRequest, ...args) {
  if (this._he4rtProvider && (this._he4rtEndpoint || this._he4rtProvider === "instagram" || this._he4rtProvider === "linkedin")) {
    const provider = this._he4rtProvider;
    const url = this._he4rtUrl || "";
    const capturedResponseType = this.responseType;

    this.addEventListener("load", async function onLoad() {
      try {
        const xhr = this as CapturedXMLHttpRequest;
        let raw: string;

        if (!capturedResponseType || capturedResponseType === "text") {
          raw = xhr.responseText;
        } else if (capturedResponseType === "json") {
          raw = JSON.stringify(xhr.response);
        } else if (xhr.response instanceof Blob) {
          raw = await (xhr.response as Blob).text();
        } else {
          raw = String(xhr.response);
        }

        const data = JSON.parse(raw);

        if (provider === "instagram") {
          if (!shouldPostInstagramPayload(xhr._he4rtEndpoint || null, data)) return;
          postPayload(
            "instagram",
            inferInstagramEndpointFromPayload(data, xhr._he4rtEndpoint || "InstagramPayload"),
            url,
            data,
          );
          return;
        }
        if (provider === "linkedin" && xhr._he4rtEndpoint) {
          postPayload("linkedin", xhr._he4rtEndpoint, url, data);
          return;
        }
        if (provider === "x" && xhr._he4rtEndpoint) {
          postPayload("x", xhr._he4rtEndpoint, url, data);
        }
      } catch (e) {
        console.debug("[Interceptor] XHR parse error:", url, capturedResponseType, (e as Error).message);
      }
    });
  }
  return originalXHRSend.apply(this, args);
};
