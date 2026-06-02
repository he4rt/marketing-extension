import { providerForHost } from "../providers/meta";
import type { PageCapturedMessage, PageGraphqlMessage } from "../shared/messages";

const sentInstagramScripts = new Set<string>();
const processedLinkedInBprGuids = new Set<string>();
let lastAnnouncedPageUrl = "";
let visibleOrderTimer: number | null = null;
let lastVisibleOrderSignature = "";
let visibleCommentsTimer: number | null = null;
let lastVisibleCommentsSignature = "";
let scanTimerA: number | null = null;
let scanTimerB: number | null = null;
let urlCheckTimer: number | null = null;
let extensionContextActive = true;
let instagramObserver: MutationObserver | null = null;
let linkedinObserver: MutationObserver | null = null;

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
  instagramObserver?.disconnect();
  linkedinObserver?.disconnect();
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
  sentInstagramScripts.clear();
  lastVisibleOrderSignature = "";
  lastVisibleCommentsSignature = "";
  announcePageSession();
  if (location.hostname.includes("instagram.com")) {
    scheduleInstagramScan();
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
    const mediaRoot = document.querySelector("article") || document.querySelector("main");
    const author = inferVisibleInstagramAuthor(mediaRoot);
    const text = inferVisibleInstagramText(null, mediaRoot, author.username);
    const metrics = inferVisibleInstagramMetrics(mediaRoot);
    seen.add(currentShortcode);
    items.push({
      author,
      mediaType:
        location.pathname.includes("/reel/") || location.pathname.includes("/reels/")
          ? "reel"
          : "unknown",
      metrics,
      shortcode: currentShortcode,
      text,
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
  anchor: HTMLAnchorElement | null,
  root: Element | null,
  username?: string,
) {
  const postImageAlt = Array.from(root?.querySelectorAll<HTMLImageElement>("img[alt]") || [])
    .map((image) => image.alt.trim())
    .find((alt) => alt && !alt.includes("'s profile picture"));
  if (postImageAlt) return postImageAlt;

  const rootText = (root?.textContent || "").replace(/\s+/g, " ").trim();
  if (!rootText || !username) return anchor?.getAttribute("aria-label") || "";
  const repeatedAuthor = rootText.lastIndexOf(username);
  if (repeatedAuthor === -1) return anchor?.getAttribute("aria-label") || "";
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

function parseVisibleCount(text: string) {
  return parseCompactNumber(text.replace(/\s+/g, "").match(/([\d.,]+[KkMm]?)/)?.[1]);
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactDomText(value: null | string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function currentInstagramCommentPageShortcode() {
  return currentInstagramShortcode() || "";
}

function parseInstagramCommentHref(href: string) {
  const match = href.match(/\/(?:p|reel|reels)\/([^/?#]+)\/c\/([^/?#]+)/);
  if (!match) return null;
  return {
    publicationShortcode: match[1] || "",
    commentId: match[2] || "",
  };
}

function findInstagramCommentRoot(anchor: HTMLAnchorElement) {
  let best: Element | null = null;
  let current: Element | null = anchor.parentElement;

  while (current && current !== document.body && current !== document.documentElement) {
    const commentLinkCount = Array.from(
      current.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ).filter((link) => parseInstagramCommentHref(link.getAttribute("href") || "")).length;
    const text = compactDomText(current.textContent);

    if (commentLinkCount > 1) break;
    if (commentLinkCount === 1 && /(Reply|Responder|Like|Curtir)/i.test(text)) {
      best = current;
    }
    current = current.parentElement;
  }

  return best || anchor.parentElement;
}

function inferInstagramCommentAuthor(root: Element | null) {
  const profileLinks = Array.from(root?.querySelectorAll<HTMLAnchorElement>("a[href]") || [])
    .map((link) => {
      const href = link.getAttribute("href") || "";
      const username = href.match(/^\/([A-Za-z0-9._]+)\/?$/)?.[1] || "";
      return { link, username, text: compactDomText(link.textContent) };
    })
    .filter((item) => item.username && !item.text.startsWith("@"));
  const authorLink =
    profileLinks.find((item) => item.text?.includes(item.username)) || profileLinks[0];
  const profileImage = Array.from(root?.querySelectorAll<HTMLImageElement>("img[alt]") || []).find(
    (image) => image.alt.includes("'s profile picture"),
  );
  const username = authorLink?.username || "";
  const nameFromAlt = profileImage?.alt.replace(/'s profile picture$/, "") || "";

  return {
    provider_user_id: "",
    username,
    name: nameFromAlt || username,
    avatar_url: profileImage?.currentSrc || profileImage?.src || "",
  };
}

function inferInstagramCommentRelativeTime(root: Element | null, commentId: string) {
  const link = Array.from(root?.querySelectorAll<HTMLAnchorElement>("a[href]") || []).find((item) =>
    (item.getAttribute("href") || "").includes(`/c/${commentId}`),
  );
  return compactDomText(link?.textContent);
}

function inferInstagramCommentLikeCount(root: Element | null) {
  const buttonText = Array.from(root?.querySelectorAll<HTMLButtonElement>("button") || [])
    .map((button) => compactDomText(button.textContent))
    .find((text) => /\d/.test(text) && /\b(like|curtida)/i.test(text));
  if (buttonText) return parseVisibleCount(buttonText);

  const rootText = compactDomText(root?.textContent);
  return parseVisibleCount(rootText.match(/\b[\d.,]+[KkMm]?\s+(?:likes?|curtidas?)\b/i)?.[0] || "");
}

function inferInstagramCommentText(
  root: Element | null,
  username: string,
  relativeCreatedAt: string,
) {
  let text = compactDomText(root?.textContent);
  if (!text) return "";

  if (username) {
    text = text.replace(new RegExp(`^${escapeRegExp(username)}(?:Verified)?\\s*`, "i"), "");
  }
  if (relativeCreatedAt) {
    text = text.replace(new RegExp(`^${escapeRegExp(relativeCreatedAt)}\\s*`, "i"), "");
  } else {
    text = text.replace(/^(?:\d+[smhdw]|now|agora)\s*/i, "");
  }

  text = text
    .replace(/[\d.,]+[KkMm]?\s+(?:likes?|curtidas?).*$/i, "")
    .replace(/(?:Reply|Responder).*$/i, "")
    .replace(/(?:Like|Curtir).*$/i, "")
    .replace(/(?:View all|Ver todas?|Hide all|Ocultar).+$/i, "")
    .trim();

  return text;
}

function inferInstagramParentCommentId(root: Element | null, commentId: string) {
  let current = root?.parentElement || null;

  while (current && current !== document.body && current !== document.documentElement) {
    const commentIds = Array.from(current.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((link) => parseInstagramCommentHref(link.getAttribute("href") || "")?.commentId)
      .filter((id): id is string => Boolean(id));
    const currentIndex = commentIds.indexOf(commentId);

    if (
      currentIndex > 0 &&
      /(Hide all replies|Ocultar|Ver respostas|View all)/i.test(compactDomText(current.textContent))
    ) {
      return commentIds[currentIndex - 1] || null;
    }

    current = current.parentElement;
  }

  return null;
}

function collectVisibleInstagramComments() {
  const comments = new Map<
    string,
    {
      author: {
        avatar_url?: string;
        name?: string;
        provider_user_id?: string;
        username: string;
      };
      comment_id: string;
      like_count: number;
      parent_comment_id: null | string;
      publication_shortcode: string;
      relative_created_at?: string;
      source: string;
      text: string;
    }
  >();
  const currentShortcode = currentInstagramCommentPageShortcode();

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const parsed = parseInstagramCommentHref(anchor.getAttribute("href") || "");
    if (!parsed?.commentId || !parsed.publicationShortcode) continue;
    if (currentShortcode && parsed.publicationShortcode !== currentShortcode) continue;

    const root = findInstagramCommentRoot(anchor);
    const author = inferInstagramCommentAuthor(root);
    const relativeCreatedAt = inferInstagramCommentRelativeTime(root, parsed.commentId);
    const text = inferInstagramCommentText(root, author.username, relativeCreatedAt);
    if (!author.username || !text) continue;

    comments.set(parsed.commentId, {
      author,
      comment_id: parsed.commentId,
      like_count: inferInstagramCommentLikeCount(root),
      parent_comment_id: inferInstagramParentCommentId(root, parsed.commentId),
      publication_shortcode: parsed.publicationShortcode,
      relative_created_at: relativeCreatedAt || undefined,
      source: "Instagram DOM",
      text,
    });
  }

  return [...comments.values()];
}

function publishVisibleInstagramComments() {
  if (!extensionContextActive) return;
  const publicationShortcode = currentInstagramCommentPageShortcode();
  if (!publicationShortcode) return;

  const commentLinkCount = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href]"),
  ).filter((anchor) => parseInstagramCommentHref(anchor.getAttribute("href") || "")).length;
  const comments = collectVisibleInstagramComments();
  if (commentLinkCount > 0 && !comments.length) return;
  if (!comments.length) return;

  const signature = comments
    .map((comment) => `${comment.comment_id}:${comment.text}:${comment.like_count}`)
    .sort()
    .join("|");
  if (signature === lastVisibleCommentsSignature) return;
  lastVisibleCommentsSignature = signature;

  sendRuntimeMessage({
    action: "VISIBLE_COMMENTS",
    provider: "instagram",
    pageUrl: location.href,
    publication_shortcode: publicationShortcode,
    captured_at: new Date().toISOString(),
    comments,
  });
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

function scheduleVisibleComments() {
  if (!extensionContextActive) return;
  if (visibleCommentsTimer) clearTimeout(visibleCommentsTimer);
  visibleCommentsTimer = window.setTimeout(() => {
    visibleCommentsTimer = null;
    publishVisibleInstagramComments();
  }, 500);
}

function scheduleInstagramScan() {
  if (!extensionContextActive) return;
  if (scanTimerA) clearTimeout(scanTimerA);
  if (scanTimerB) clearTimeout(scanTimerB);
  scanTimerA = window.setTimeout(scanInstagramSsrScripts, 500);
  scanTimerB = window.setTimeout(scanInstagramSsrScripts, 2000);
  scheduleVisibleOrder();
  scheduleVisibleComments();
}

if (location.hostname.includes("instagram.com")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInstagramScan, { once: true });
  } else {
    scheduleInstagramScan();
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
      handleUrlChange();
      scheduleInstagramScan();
    }
  });
  instagramObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", () => {
    scheduleVisibleOrder();
    scheduleVisibleComments();
  });
}

if (location.hostname === "www.linkedin.com" || location.hostname === "linkedin.com") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        scanLinkedInBprElements();
      },
      { once: true },
    );
  } else {
    scanLinkedInBprElements();
  }

  linkedinObserver = new MutationObserver((mutations) => {
    if (!extensionContextActive) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        if (el.tagName === "CODE" && el.id?.startsWith("bpr-guid-")) {
          processLinkedInBprElement(el as HTMLElement);
        } else if (el.querySelectorAll) {
          const nested = el.querySelectorAll<HTMLElement>('code[id^="bpr-guid-"]');
          for (const code of nested) processLinkedInBprElement(code);
        }
      }
    }
  });
  linkedinObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#92;u/g, "\\u")
    .replace(/&#(\d+);/g, (_: string, c: string) => String.fromCharCode(Number(c)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function normalizeKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[key.trim()] = normalizeKeys(value);
  }
  return normalized;
}

function processLinkedInBprElement(codeEl: HTMLElement) {
  const id = codeEl.id;
  if (!id?.startsWith("bpr-guid-")) return;
  const guid = id.replace("bpr-guid-", "");
  if (processedLinkedInBprGuids.has(guid)) return;
  processedLinkedInBprGuids.add(guid);

  try {
    const raw = codeEl.textContent || "";
    if (raw.length < 50) return;
    const unescaped = unescapeHtml(raw);
    const parsed = JSON.parse(unescaped);
    const normalized = normalizeKeys(parsed) as Record<string, unknown>;
    const innerData =
      ((normalized?.data as Record<string, unknown>)?.data as Record<string, unknown>) || {};

    const feedKey = Object.keys(innerData).find(
      (k) =>
        k.startsWith("feedDashOrganizationalPageUpdates") &&
        Array.isArray((innerData[k] as Record<string, unknown>)?.["*elements"]),
    );
    if (!feedKey) return;

    const elements = (innerData[feedKey] as Record<string, unknown>)?.["*elements"] as
      | string[]
      | undefined;
    if (!elements?.length) return;

    sendRuntimeMessage({
      action: "CAPTURED_PAYLOAD",
      provider: "linkedin",
      endpoint: "feedDashOrganizationalPageUpdates",
      url: `https://www.linkedin.com/bpr/${feedKey}`,
      payload: normalized,
      timestamp: new Date().toISOString(),
      pageUrl: location.href,
    });
  } catch {
    // BPR parse failure is non-critical
  }
}

function scanLinkedInBprElements() {
  if (!extensionContextActive) return;
  const codes = document.querySelectorAll<HTMLElement>('code[id^="bpr-guid-"]');
  for (const el of codes) processLinkedInBprElement(el);
}
