import type { PageCapturedMessage, PageGraphqlMessage } from "../shared/messages";

const sentInstagramScripts = new Set<string>();
const pageSessionKey = `${Date.now()}:${Math.random().toString(36).slice(2)}:${location.href}`;
let visibleOrderTimer: number | null = null;
let lastVisibleOrderSignature = "";
let scanTimerA: number | null = null;
let scanTimerB: number | null = null;
let extensionContextActive = true;
let instagramObserver: MutationObserver | null = null;

function stopAfterInvalidContext() {
  extensionContextActive = false;
  if (visibleOrderTimer) clearTimeout(visibleOrderTimer);
  if (scanTimerA) clearTimeout(scanTimerA);
  if (scanTimerB) clearTimeout(scanTimerB);
  visibleOrderTimer = null;
  scanTimerA = null;
  scanTimerB = null;
  instagramObserver?.disconnect();
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
  if (location.hostname.includes("instagram.com")) return "instagram";
  if (location.hostname === "x.com" || location.hostname.endsWith(".x.com")) return "x";
  if (location.hostname === "twitter.com") return "x";
  return null;
}

function announcePageSession() {
  const provider = currentProvider();
  if (!provider) return;
  sendRuntimeMessage({
    action: "PAGE_SESSION_STARTED",
    provider,
    pageUrl: location.href,
    sessionKey: pageSessionKey,
  });
}

announcePageSession();

function handlePageMessage(event: MessageEvent<PageCapturedMessage | PageGraphqlMessage>) {
  if (event.source !== window || !extensionContextActive) return;

  if (event.data.type === "SOCIAL_CAPTURED") {
    console.log(`[He4rt Analytics] encaminhando ${event.data.provider}:${event.data.endpoint}`);
    sendRuntimeMessage({
      action: "CAPTURED_PAYLOAD",
      provider: event.data.provider,
      endpoint: event.data.endpoint,
      url: event.data.url,
      payload: event.data.payload,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
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

function currentInstagramShortcode() {
  if (!location.hostname.includes("instagram.com")) return null;
  return location.pathname.match(/\/(?:p|reel|reels)\/([^/?#]+)/)?.[1] || null;
}

function instagramScriptEndpoint(text: string, shortcode: null | string) {
  if (text.includes("xdt_api__v1__media__media_id__comments__connection")) {
    return "InstagramComments";
  }
  if (text.includes("xdt_api__v1__feed__timeline__connection")) {
    return "InstagramFeedSSR";
  }
  if (
    shortcode &&
    text.includes(shortcode) &&
    text.includes('"like_count"') &&
    text.includes('"comment_count"')
  ) {
    return "InstagramPageSSR";
  }
  if (
    text.includes('"code"') &&
    text.includes('"like_count"') &&
    text.includes('"comment_count"') &&
    (text.includes('"profile_pic_url"') || text.includes('"media_type"'))
  ) {
    return "InstagramInitialSSR";
  }
  return null;
}

function scanInstagramSsrScripts() {
  if (!extensionContextActive) return;
  const shortcode = currentInstagramShortcode();

  for (const [index, script] of Array.from(document.scripts).entries()) {
    const text = script.textContent || "";
    const endpoint = instagramScriptEndpoint(text, shortcode);
    if (!endpoint) continue;

    const key = `${location.pathname}:${endpoint}:${index}:${text.length}`;
    if (sentInstagramScripts.has(key)) continue;

    try {
      const payload = JSON.parse(text);
      sentInstagramScripts.add(key);
      console.log(`[He4rt Analytics] SSR instagram:${endpoint}`);
      sendRuntimeMessage({
        action: "CAPTURED_PAYLOAD",
        provider: "instagram",
        endpoint,
        url: location.href,
        payload,
        timestamp: new Date().toISOString(),
        pageUrl: location.href,
      });
    } catch {}
  }
}

function collectVisibleInstagramPublications() {
  const seen = new Set<string>();
  const items: Array<{
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
  }> = [];

  const currentShortcode = currentInstagramShortcode();
  if (currentShortcode) {
    seen.add(currentShortcode);
    items.push({
      mediaType:
        location.pathname.includes("/reel/") || location.pathname.includes("/reels/")
          ? "reel"
          : "unknown",
      shortcode: currentShortcode,
      url: `https://www.instagram.com${location.pathname}`,
    });
  }

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = anchor.getAttribute("href") || "";
    const shortcode = href.match(/^\/(?:p|reel|reels)\/([^/?#]+)\/?$/)?.[1];
    if (!shortcode || seen.has(shortcode)) continue;
    const mediaRoot = anchor.closest("article") || anchor.closest("main") || anchor.parentElement;
    const author = inferVisibleInstagramAuthor(mediaRoot);
    const text = inferVisibleInstagramText(anchor, mediaRoot, author.username);
    const mediaType = inferVisibleInstagramMediaType(href, anchor, mediaRoot);
    const metrics = inferVisibleInstagramMetrics(mediaRoot);
    seen.add(shortcode);
    items.push({
      author,
      mediaType,
      metrics,
      shortcode,
      text,
      url: new URL(href, location.origin).toString(),
    });
  }
  return items;
}

function inferVisibleInstagramAuthor(root: Element | null) {
  const profileLink = Array.from(root?.querySelectorAll<HTMLAnchorElement>("a[href]") || []).find(
    (link) => /^\/[A-Za-z0-9._]+\/?$/.test(link.getAttribute("href") || ""),
  );
  const username = (profileLink?.getAttribute("href") || "").replaceAll("/", "").trim();
  const profileImage = Array.from(root?.querySelectorAll<HTMLImageElement>("img[alt]") || []).find(
    (image) => image.alt.includes("'s profile picture"),
  );
  const nameFromAlt = profileImage?.alt.replace(/'s profile picture$/, "") || "";
  return {
    username,
    name: nameFromAlt || username,
    avatar_url: profileImage?.currentSrc || profileImage?.src || "",
  };
}

function inferVisibleInstagramText(
  anchor: HTMLAnchorElement,
  root: Element | null,
  username?: string,
) {
  const postImageAlt = Array.from(root?.querySelectorAll<HTMLImageElement>("img[alt]") || [])
    .map((image) => image.alt.trim())
    .find((alt) => alt && !alt.includes("'s profile picture"));
  if (postImageAlt) return postImageAlt;

  const rootText = (root?.textContent || "").replace(/\s+/g, " ").trim();
  if (!rootText || !username) return anchor.getAttribute("aria-label") || "";
  const repeatedAuthor = rootText.lastIndexOf(username);
  if (repeatedAuthor === -1) return anchor.getAttribute("aria-label") || "";
  return rootText
    .slice(repeatedAuthor + username.length)
    .replace(/\bmore$/i, "")
    .trim();
}

function inferVisibleInstagramMetrics(root: Element | null) {
  const text = (root?.textContent || "").replace(/\s+/g, "");
  return {
    comment_count: parseCompactNumber(text.match(/Comment([\d.,]+[KkMm]?)/)?.[1]),
    like_count: parseCompactNumber(text.match(/Likedby[\w.]+and([\d.,]+[KkMm]?)others/i)?.[1]),
  };
}

function parseCompactNumber(value?: string) {
  if (!value) return 0;
  const normalized = value.replace(",", ".").toLowerCase();
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return 0;
  if (normalized.endsWith("k")) return Math.round(number * 1000);
  if (normalized.endsWith("m")) return Math.round(number * 1_000_000);
  return Math.round(number);
}

function inferVisibleInstagramMediaType(
  href: string,
  anchor: HTMLAnchorElement,
  mediaRoot: Element | null,
) {
  if (/^\/(?:reel|reels)\//.test(href)) return "reel";
  if (anchor.querySelector("video") || mediaRoot?.querySelector("video")) return "video";
  if (anchor.querySelectorAll("img").length > 1) return "carousel";
  if (anchor.querySelector("img")) return "image";
  return "unknown";
}

function publishVisibleInstagramOrder() {
  if (!extensionContextActive) return;
  const items = collectVisibleInstagramPublications();
  if (!items.length) return;
  const signature = items.map((item) => item.shortcode).join(",");
  if (signature === lastVisibleOrderSignature) return;
  lastVisibleOrderSignature = signature;
  sendRuntimeMessage({
    action: "VISIBLE_PUBLICATIONS",
    provider: "instagram",
    pageUrl: location.href,
    shortcodes: items.map((item) => item.shortcode),
    items,
  });
}

function scheduleVisibleOrder() {
  if (!extensionContextActive) return;
  if (visibleOrderTimer) clearTimeout(visibleOrderTimer);
  visibleOrderTimer = window.setTimeout(() => {
    visibleOrderTimer = null;
    publishVisibleInstagramOrder();
  }, 400);
}

if (location.hostname.includes("instagram.com")) {
  const scheduleScan = () => {
    if (!extensionContextActive) return;
    if (scanTimerA) clearTimeout(scanTimerA);
    if (scanTimerB) clearTimeout(scanTimerB);
    scanTimerA = window.setTimeout(scanInstagramSsrScripts, 500);
    scanTimerB = window.setTimeout(scanInstagramSsrScripts, 2000);
    scheduleVisibleOrder();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
  } else {
    scheduleScan();
  }

  instagramObserver = new MutationObserver((mutations) => {
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
      scheduleScan();
    }
  });
  instagramObserver.observe(document.documentElement, { childList: true, subtree: true });
}
