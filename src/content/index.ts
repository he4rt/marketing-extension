import { captureFacetForHost } from "../capture/registry";
import type {
  AnyLiveDomScrapeStrategy,
  CaptureFacet,
  EmbeddedCodeScanStrategy,
} from "../capture/strategies";
import { providerForHost } from "../providers/meta";
import { approxBytes, logHe4rt } from "../shared/log";
import type { PageCapturedMessage, PageGraphqlMessage } from "../shared/messages";

// Motor de captura no DOM (ISOLATED world). Antes este arquivo tinha blocos hardcoded por
// host (scan SSR + scrape do Instagram, scan BPR do LinkedIn). Agora ele resolve a faceta de
// captura do provider ativo no registry e roda, de forma genérica, as estratégias declaradas:
//   - ssrScriptScan  -> varre <script> SSR e emite CAPTURED_PAYLOAD;
//   - embeddedCodeScan -> varre/observa elementos <code> embutidos e emite CAPTURED_PAYLOAD;
//   - liveDomScrapes -> lê o DOM renderizado e emite as mensagens VISIBLE_* (via toMessage).
// As mensagens e o agendamento (timers/observers) são idênticos aos de antes.

const activeFacet = captureFacetForHost(location.hostname);

const sentScripts = new Set<string>();
const lastScrapeSignatures = new Map<string, string>();
let lastAnnouncedPageUrl = "";
let visibleOrderTimer: number | null = null;
let visibleCommentsTimer: number | null = null;
let scanTimerA: number | null = null;
let scanTimerB: number | null = null;
let urlCheckTimer: number | null = null;
let extensionContextActive = true;
let scrapeObserver: MutationObserver | null = null;
let embeddedObserver: MutationObserver | null = null;

function stopAfterInvalidContext() {
  extensionContextActive = false;
  if (visibleOrderTimer) clearTimeout(visibleOrderTimer);
  if (visibleCommentsTimer) clearTimeout(visibleCommentsTimer);
  if (scanTimerA) clearTimeout(scanTimerA);
  if (scanTimerB) clearTimeout(scanTimerB);
  if (urlCheckTimer) clearInterval(urlCheckTimer);
  visibleOrderTimer = null;
  visibleCommentsTimer = null;
  scanTimerA = null;
  scanTimerB = null;
  urlCheckTimer = null;
  scrapeObserver?.disconnect();
  embeddedObserver?.disconnect();
  window.removeEventListener("message", handlePageMessage);
}

function sendRuntimeMessage(message: Record<string, unknown>) {
  if (!extensionContextActive) return;

  try {
    if (!chrome.runtime?.id) {
      stopAfterInvalidContext();
      return;
    }
    chrome.runtime.sendMessage(message, () => {
      try {
        if (chrome.runtime.lastError?.message?.includes("Extension context invalidated")) {
          stopAfterInvalidContext();
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("Extension context invalidated")) {
          stopAfterInvalidContext();
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Extension context invalidated")) {
      stopAfterInvalidContext();
      return;
    }
    throw error;
  }
}

function currentProvider() {
  return providerForHost(location.hostname);
}

function createPageSessionKey(url: string) {
  return `${Date.now()}:${Math.random().toString(36).slice(2)}:${url}`;
}

function announcePageSession() {
  const provider = currentProvider();
  if (!provider) return;
  const pageUrl = location.href;
  lastAnnouncedPageUrl = pageUrl;
  sendRuntimeMessage({
    action: "PAGE_SESSION_STARTED",
    provider,
    pageUrl,
    sessionKey: createPageSessionKey(pageUrl),
  });
}

announcePageSession();

function handleUrlChange() {
  if (!extensionContextActive || location.href === lastAnnouncedPageUrl) return;
  sentScripts.clear();
  lastScrapeSignatures.clear();
  announcePageSession();
  if (activeFacet?.ssrScriptScan || activeFacet?.liveDomScrapes?.length) {
    scheduleDomScan();
  }
}

function installSpaNavigationObserver() {
  const wrapHistoryMethod = (method: "pushState" | "replaceState") => {
    const original = history[method];
    history[method] = function patchedHistoryMethod(
      this: History,
      ...args: Parameters<History[typeof method]>
    ) {
      const result = original.apply(this, args);
      window.setTimeout(handleUrlChange, 0);
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", () => window.setTimeout(handleUrlChange, 0));
}

installSpaNavigationObserver();

urlCheckTimer = window.setInterval(handleUrlChange, 750);

function handlePageMessage(event: MessageEvent<PageCapturedMessage | PageGraphqlMessage>) {
  if (event.source !== window || !extensionContextActive) return;

  if (event.data.type === "SOCIAL_CAPTURED") {
    logHe4rt(
      "bridge",
      `encaminhando ${event.data.provider}:${event.data.endpoint} · ${approxBytes(event.data.payload)}B`,
    );
    sendRuntimeMessage({
      action: "CAPTURED_PAYLOAD",
      provider: event.data.provider,
      endpoint: event.data.endpoint,
      url: event.data.url,
      payload: event.data.payload,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      signature: event.data.signature, // assinatura L3 (headers) → harvest no SW.
    });
  }

  if (event.data.type === "X_GRAPHQL_RESPONSE") {
    sendRuntimeMessage({
      action: "GRAPHQL_CAPTURED",
      endpoint: event.data.endpoint,
      url: event.data.url,
      payload: event.data.payload,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
    });
  }
}

window.addEventListener("message", handlePageMessage);

// === ssrScriptScan runner ==================================================

function runSsrScriptScan(facet: CaptureFacet) {
  if (!extensionContextActive) return;
  const strategy = facet.ssrScriptScan;
  if (!strategy) return;
  const ctx = { pathname: location.pathname, href: location.href };

  for (const [index, script] of Array.from(document.scripts).entries()) {
    const text = script.textContent || "";
    const matched = strategy.match(text, ctx);
    if (!matched) continue;
    const endpoint = matched.endpoint;

    const key = `${location.pathname}:${endpoint}:${index}:${text.length}`;
    if (sentScripts.has(key)) continue;

    try {
      const payload = JSON.parse(text);
      sentScripts.add(key);
      console.log(`[He4rt Analytics] SSR ${facet.id}:${endpoint}`);
      sendRuntimeMessage({
        action: "CAPTURED_PAYLOAD",
        provider: facet.id,
        endpoint,
        url: location.href,
        payload,
        timestamp: new Date().toISOString(),
        pageUrl: location.href,
      });
    } catch {}
  }
}

// === liveDomScrape runner ==================================================

// Roda um scrape e emite a mensagem SÓ quando a assinatura muda E o toMessage retorna um
// envelope (os guards específicos vivem no toMessage do provider). A assinatura só é
// comitada num envio efetivo — preserva o comportamento original em que lastSignature era
// atualizado apenas ao enviar, nunca quando um guard barrava o envio.
function runScrape(strategy: AnyLiveDomScrapeStrategy) {
  if (!extensionContextActive) return;
  const items = strategy.extract(document);
  const signature = strategy.signature(items);
  if (signature === lastScrapeSignatures.get(strategy.endpoint)) return;

  const message = strategy.toMessage(items, document);
  if (!message) return;

  lastScrapeSignatures.set(strategy.endpoint, signature);
  sendRuntimeMessage(message as unknown as Record<string, unknown>);
}

// Mantém o agendamento original do Instagram: scrape de ordem em 400ms, de comentários em
// 500ms. O primeiro liveDomScrape declarado mapeia o timer de "ordem" e o segundo o de
// "comentários", espelhando publishVisibleInstagramOrder/Comments.
function scrapeAt(index: number) {
  return activeFacet?.liveDomScrapes?.[index] ?? null;
}

function scheduleVisibleOrder() {
  if (!extensionContextActive) return;
  const strategy = scrapeAt(0);
  if (!strategy) return;
  if (visibleOrderTimer) clearTimeout(visibleOrderTimer);
  visibleOrderTimer = window.setTimeout(() => {
    visibleOrderTimer = null;
    runScrape(strategy);
  }, 400);
}

function scheduleVisibleComments() {
  if (!extensionContextActive) return;
  const strategy = scrapeAt(1);
  if (!strategy) return;
  if (visibleCommentsTimer) clearTimeout(visibleCommentsTimer);
  visibleCommentsTimer = window.setTimeout(() => {
    visibleCommentsTimer = null;
    runScrape(strategy);
  }, 500);
}

function scheduleDomScan() {
  if (!extensionContextActive) return;
  if (activeFacet?.ssrScriptScan) {
    if (scanTimerA) clearTimeout(scanTimerA);
    if (scanTimerB) clearTimeout(scanTimerB);
    scanTimerA = window.setTimeout(() => activeFacet && runSsrScriptScan(activeFacet), 500);
    scanTimerB = window.setTimeout(() => activeFacet && runSsrScriptScan(activeFacet), 2000);
  }
  scheduleVisibleOrder();
  scheduleVisibleComments();
}

// === embeddedCodeScan runner ===============================================

function processEmbeddedElement(
  facet: CaptureFacet,
  strategy: EmbeddedCodeScanStrategy,
  el: Element,
) {
  const result = strategy.parse(el.textContent || "", el);
  if (!result) return;
  sendRuntimeMessage({
    action: "CAPTURED_PAYLOAD",
    provider: facet.id,
    endpoint: result.endpoint,
    url: result.url ?? location.href,
    payload: result.payload,
    timestamp: new Date().toISOString(),
    pageUrl: location.href,
  });
}

function scanEmbeddedElements(facet: CaptureFacet) {
  if (!extensionContextActive) return;
  const strategy = facet.embeddedCodeScan;
  if (!strategy) return;
  for (const el of document.querySelectorAll(strategy.selector)) {
    processEmbeddedElement(facet, strategy, el);
  }
}

// === activation ============================================================

if (activeFacet?.ssrScriptScan || activeFacet?.liveDomScrapes?.length) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleDomScan, { once: true });
  } else {
    scheduleDomScan();
  }

  scrapeObserver = new MutationObserver((mutations) => {
    if (!extensionContextActive) return;
    if (
      mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeName === "SCRIPT" ||
            node.nodeName === "A" ||
            node.nodeType === Node.ELEMENT_NODE,
        ),
      )
    ) {
      handleUrlChange();
      scheduleDomScan();
    }
  });
  scrapeObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", () => {
    scheduleVisibleOrder();
    scheduleVisibleComments();
  });
}

if (activeFacet?.embeddedCodeScan) {
  const facet = activeFacet;
  const strategy: EmbeddedCodeScanStrategy = activeFacet.embeddedCodeScan;
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        scanEmbeddedElements(facet);
      },
      { once: true },
    );
  } else {
    scanEmbeddedElements(facet);
  }

  embeddedObserver = new MutationObserver((mutations) => {
    if (!extensionContextActive) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        if (strategy.match(el)) {
          processEmbeddedElement(facet, strategy, el);
        } else if (el.querySelectorAll) {
          const nested = el.querySelectorAll(strategy.selector);
          for (const code of nested) processEmbeddedElement(facet, strategy, code);
        }
      }
    }
  });
  embeddedObserver.observe(document.documentElement, { childList: true, subtree: true });
}
