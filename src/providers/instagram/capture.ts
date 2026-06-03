import type {
  LiveDomScrapeStrategy,
  NetworkInterceptStrategy,
  SsrScriptScanStrategy,
} from "../../capture/strategies";

// Estratégias de captura do Instagram. Toda a lógica abaixo foi MOVIDA, sem reescrita:
//  - networkIntercept: extractInstagramEndpointName + shouldPostInstagramPayload
//    (INSTAGRAM_MARKERS) + inferInstagramEndpointFromPayload do antigo interceptor;
//  - ssrScriptScan: instagramScriptEndpoint do antigo content;
//  - liveDomScrapes: collectVisibleInstagramPublications / collectVisibleInstagramComments
//    e todos os inferVisibleInstagram*/inferInstagramComment* do antigo content.

// === networkIntercept (MAIN world) ========================================

const INSTAGRAM_MARKERS = [
  "xdt_api__v1__feed__timeline__connection",
  "xdt_api__v1__media__media_id__comments__connection",
  "xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection",
  '"like_count"',
  '"comment_count"',
  '"profile_pic_url"',
];

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

// Instagram sempre passa pela inspeção da resposta (mesmo sem endpoint na URL),
// então o match devolve um endpoint potencialmente vazio (""); o gate decide se
// vale postar e o rename reclassifica pelo conteúdo do payload.
export const instagramNetworkIntercept: NetworkInterceptStrategy = {
  kind: "networkIntercept",
  match(url, init) {
    return { endpoint: extractInstagramEndpointName(url, init?.body) ?? "" };
  },
  gate(payload, endpoint) {
    return shouldPostInstagramPayload(endpoint || null, payload);
  },
  rename(payload, endpoint) {
    return inferInstagramEndpointFromPayload(payload, endpoint || "InstagramPayload");
  },
};

// === ssrScriptScan (ISOLATED world) =======================================

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

export const instagramSsrScriptScan: SsrScriptScanStrategy = {
  kind: "ssrScriptScan",
  match(text) {
    const endpoint = instagramScriptEndpoint(text, currentInstagramShortcode());
    return endpoint ? { endpoint } : null;
  },
};

// === liveDomScrape (ISOLATED world) =======================================

function currentInstagramShortcode() {
  if (!location.hostname.includes("instagram.com")) return null;
  return location.pathname.match(/\/(?:p|reel|reels)\/([^/?#]+)/)?.[1] || null;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactDomText(value: null | string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
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

export type VisibleInstagramPublication = {
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
};

function collectVisibleInstagramPublications(): VisibleInstagramPublication[] {
  const seen = new Set<string>();
  const items: VisibleInstagramPublication[] = [];

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

export type VisibleInstagramComment = {
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
};

function collectVisibleInstagramComments(): VisibleInstagramComment[] {
  const comments = new Map<string, VisibleInstagramComment>();
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

// Scrape de ordem de publicações visíveis -> VISIBLE_PUBLICATIONS.
// Espelha publishVisibleInstagramOrder: emite todos os itens com a assinatura por
// shortcodes (o dedupe por assinatura fica no motor genérico do content).
export const instagramVisiblePublicationsScrape: LiveDomScrapeStrategy<VisibleInstagramPublication> =
  {
    kind: "liveDomScrape",
    endpoint: "VISIBLE_PUBLICATIONS",
    extract: () => collectVisibleInstagramPublications(),
    signature: (items) => items.map((item) => item.shortcode).join(","),
    toMessage(items) {
      if (!items.length) return null;
      return {
        action: "VISIBLE_PUBLICATIONS",
        provider: "instagram",
        pageUrl: location.href,
        shortcodes: items.map((item) => item.shortcode),
        items,
      };
    },
  };

// Scrape de comentários visíveis -> VISIBLE_COMMENTS.
// Espelha publishVisibleInstagramComments, incluindo os guards: exige shortcode da
// página e descarta quando há links de comentário no DOM mas nenhum comentário pôde
// ser reconstruído (DOM ainda renderizando).
export const instagramVisibleCommentsScrape: LiveDomScrapeStrategy<VisibleInstagramComment> = {
  kind: "liveDomScrape",
  endpoint: "VISIBLE_COMMENTS",
  extract: () => collectVisibleInstagramComments(),
  signature: (comments) =>
    comments
      .map((comment) => `${comment.comment_id}:${comment.text}:${comment.like_count}`)
      .sort()
      .join("|"),
  toMessage(comments) {
    const publicationShortcode = currentInstagramCommentPageShortcode();
    if (!publicationShortcode) return null;

    const commentLinkCount = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ).filter((anchor) => parseInstagramCommentHref(anchor.getAttribute("href") || "")).length;
    if (commentLinkCount > 0 && !comments.length) return null;
    if (!comments.length) return null;

    return {
      action: "VISIBLE_COMMENTS",
      provider: "instagram",
      pageUrl: location.href,
      publication_shortcode: publicationShortcode,
      captured_at: new Date().toISOString(),
      comments,
    };
  },
};
