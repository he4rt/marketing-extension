import { captureFacetForHost } from "../capture/registry";
import type { NetworkInterceptStrategy } from "../capture/strategies";
import type { SocialProvider } from "../shared/domain";
import type { PageCapturedMessage } from "../shared/messages";

// Motor de captura de rede (MAIN world). Antes este arquivo carregava um if-cascade por
// provider (extractX/LinkedIn/InstagramEndpointName, markers, infer*). Agora ele só patcheia
// fetch/XHR e delega a DETECÇÃO para a estratégia networkIntercept do provider ativo, lida do
// registry de captura. As mensagens emitidas (SOCIAL_CAPTURED) são idênticas às de antes.

type ResolvedStrategy = {
  provider: SocialProvider;
  strategy: NetworkInterceptStrategy;
};

function resolveStrategy(url: string): ResolvedStrategy | null {
  let hostname: string;
  try {
    hostname = new URL(url, window.location.href).hostname;
  } catch {
    return null;
  }
  const facet = captureFacetForHost(hostname);
  if (!facet?.networkIntercept) return null;
  return { provider: facet.id, strategy: facet.networkIntercept };
}

// Decide se a requisição interessa. Reproduz `endpoint || provider === "instagram"`:
// intercepta quando há endpoint na URL OU quando a estratégia tem gate (inspeciona toda
// resposta mesmo sem endpoint na URL — o caso do Instagram).
function shouldIntercept(strategy: NetworkInterceptStrategy, endpoint: string | null) {
  return Boolean(endpoint) || Boolean(strategy.gate);
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

// Aplica gate + rename da estratégia e posta, se o endpoint final for válido. Reproduz o
// antigo inspectResponse: linkedin/x postam só com endpoint; instagram passa pelo gate e
// reclassifica o endpoint pelo payload antes de postar.
function emitFromPayload(
  resolved: ResolvedStrategy,
  endpoint: string | null,
  url: string,
  payload: unknown,
) {
  const { provider, strategy } = resolved;
  if (strategy.gate && !strategy.gate(payload, endpoint)) return;
  const finalEndpoint = strategy.rename ? strategy.rename(payload, endpoint) : endpoint;
  if (!finalEndpoint) return;
  postPayload(provider, finalEndpoint, url, payload);
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
  const resolved = resolveStrategy(url);

  if (resolved) {
    const match = resolved.strategy.match(url, init ? { body: init.body } : null);
    const endpoint = match?.endpoint ?? null;
    if (match && shouldIntercept(resolved.strategy, endpoint)) {
      return originalFetch.apply(this, args).then(async (response) => {
        try {
          const clone = response.clone();
          // Hint genérico: "text" lê o corpo cru (stream SDUI/Flight); senão json().
          const data = match.responseFormat === "text" ? await clone.text() : await clone.json();
          emitFromPayload(resolved, endpoint, url, data);
        } catch {}
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
  _he4rtResolved?: ResolvedStrategy | null;
  _he4rtUrl?: string;
  _he4rtResponseFormat?: "json" | "text";
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

XMLHttpRequest.prototype.open = function patchedOpen(
  this: CapturedXMLHttpRequest,
  method: string,
  url: string | URL,
  async: boolean = true,
  username?: null | string,
  password?: null | string,
) {
  const absoluteUrl = resolveUrl(url);
  const resolved = resolveStrategy(absoluteUrl);
  const match = resolved ? resolved.strategy.match(absoluteUrl) : null;
  this._he4rtUrl = absoluteUrl;
  this._he4rtResolved = resolved;
  this._he4rtEndpoint = match?.endpoint ?? null;
  this._he4rtResponseFormat = match?.responseFormat ?? "json";
  return originalXHROpen.call(this, method, url, async, username ?? null, password ?? null);
};

XMLHttpRequest.prototype.send = function patchedSend(this: CapturedXMLHttpRequest, ...args) {
  const resolved = this._he4rtResolved;
  if (resolved && shouldIntercept(resolved.strategy, this._he4rtEndpoint || null)) {
    const url = this._he4rtUrl || "";
    const endpoint = this._he4rtEndpoint || null;
    const capturedResponseType = this.responseType;
    const responseFormat = this._he4rtResponseFormat ?? "json";

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

        // Hint genérico: "text" emite o corpo cru (stream SDUI/Flight); senão JSON.parse.
        const data = responseFormat === "text" ? raw : JSON.parse(raw);
        emitFromPayload(resolved, endpoint, url, data);
      } catch (e) {
        console.debug(
          "[Interceptor] XHR parse error:",
          url,
          capturedResponseType,
          (e as Error).message,
        );
      }
    });
  }
  return originalXHRSend.apply(this, args);
};
