import type {
  EndpointStore,
  ExportJSON,
  SocialProvider,
  SocialPublication,
} from "../shared/domain";

type PublicationsResponse = {
  commentsCount?: number;
  engagementsCount?: number;
  publications?: SocialPublication[];
};

type EndpointsResponse = {
  endpoints?: Record<string, Pick<EndpointStore, "count" | "endpoint" | "lastSeen" | "provider">>;
};

type EndpointPayloadsResponse = {
  payloads?: unknown[];
};

type AllRawResponse = {
  endpoints?: Record<string, EndpointStore>;
};

let activeProvider: null | SocialProvider = null;
let activePageUrl = "";
let refreshSequence = 0;

const handleInput = getElement<HTMLInputElement>("handleInput");
const setHandleBtn = getElement<HTMLButtonElement>("setHandleBtn");
const publicationCountEl = getElement<HTMLElement>("publicationCount");
const interactionCountEl = getElement<HTMLElement>("interactionCount");
const exportBtn = getElement<HTMLButtonElement>("exportBtn");
const clearBtn = getElement<HTMLButtonElement>("clearBtn");
const emptyPublications = getElement<HTMLElement>("emptyPublications");
const publicationList = getElement<HTMLElement>("publicationList");
const endpointCountEl = getElement<HTMLElement>("endpointCount");
const copyAllBtn = getElement<HTMLButtonElement>("copyAllBtn");
const emptyEndpoints = getElement<HTMLElement>("emptyEndpoints");
const endpointList = getElement<HTMLElement>("endpointList");

document.addEventListener("DOMContentLoaded", () => {
  refreshForActiveTab();

  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("active");
      });
      tab.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((c) => {
        c.classList.add("hidden");
      });
      getElement(`tab-${tab.dataset.tab}`).classList.remove("hidden");
    });
  });

  setHandleBtn.addEventListener("click", setHandle);
  handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setHandle();
  });
  handleInput.addEventListener("change", () => {
    if (!handleInput.value.trim()) setHandle();
  });
  exportBtn.addEventListener("click", handleExport);
  clearBtn.addEventListener("click", handleClear);
  copyAllBtn.addEventListener("click", handleCopyAll);

  chrome.runtime.onMessage.addListener((message: { action?: string }) => {
    if (message.action === "STORE_UPDATED") {
      refreshForActiveTab();
    }
  });

  chrome.tabs.onActivated?.addListener(() => refreshForActiveTab());
  chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === "complete" || changeInfo.url) refreshForActiveTab();
  });

  window.setInterval(() => {
    refreshForActiveTab();
  }, 2000);
});

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado`);
  return element as T;
}

function setHandle() {
  const handle = handleInput.value.trim().replace(/^@/, "");
  handleInput.value = handle;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    const provider = providerFromUrl(tab?.url) || activeProvider;
    const pageUrl = tab?.url || activePageUrl;
    activeProvider = provider;
    activePageUrl = pageUrl;
    chrome.runtime.sendMessage({ action: "SET_HANDLE", handle, provider, pageUrl }, () => {
      loadPublications();
      loadEndpoints();
    });
  });
}

function providerFromUrl(url?: string): null | SocialProvider {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    if (hostname === "www.instagram.com" || hostname.endsWith(".instagram.com")) {
      return "instagram";
    }
    if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com") {
      return "x";
    }
  } catch {}
  return null;
}

function refreshForActiveTab() {
  const sequence = ++refreshSequence;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (sequence !== refreshSequence) return;
    const tab = tabs[0];
    const provider = providerFromUrl(tab?.url);
    activeProvider = provider;
    activePageUrl = tab?.url || "";
    chrome.runtime.sendMessage(
      { action: "SET_ACTIVE_PROVIDER", provider, pageUrl: tab?.url },
      () => {
        if (sequence !== refreshSequence) return;
        syncHandleInput(provider);
        loadPublications();
        loadEndpoints();
      },
    );
  });
}

function syncHandleInput(provider: null | SocialProvider) {
  chrome.runtime.sendMessage({ action: "GET_HANDLE", provider }, (r: { handle?: string }) => {
    if (document.activeElement === handleInput) return;
    handleInput.value = r?.handle || "";
  });
}

function loadPublications() {
  chrome.runtime.sendMessage(
    { action: "GET_PUBLICATIONS", provider: activeProvider },
    (r: PublicationsResponse | undefined) => {
      if (!r) return;
      renderPublications(r.publications || [], (r.commentsCount || 0) + (r.engagementsCount || 0));
    },
  );
}

function renderPublications(publications: SocialPublication[], interactions: number) {
  publicationCountEl.textContent = `${publications.length} ${plural(publications.length, "publicação", "publicações")}`;
  interactionCountEl.textContent = `${interactions} ${plural(interactions, "interação", "interações")}`;
  const hasData = publications.length > 0;
  exportBtn.disabled = !hasData;
  clearBtn.disabled = !hasData;

  if (!hasData) {
    emptyPublications.classList.remove("hidden");
    publicationList.classList.add("hidden");
    return;
  }

  emptyPublications.classList.add("hidden");
  publicationList.classList.remove("hidden");
  publicationList.innerHTML = "";

  for (const publication of publications) {
    const card = document.createElement("div");
    card.className = "publication-card";

    const providerLabel = publication.provider === "instagram" ? "Instagram" : "X";
    const typeClass = `publication-type-${publication.type}`;
    const date = publication.created_at ? formatDate(publication.created_at) : "";
    const metrics = publication.metrics;
    const author = publication.author.username
      ? `@${publication.author.username}`
      : "Publicação visível";
    const text =
      publication.text ||
      (publication.is_placeholder ? "Dados básicos capturados pelo DOM" : "(sem legenda)");

    card.innerHTML = `
      <div class="publication-top">
        <span class="provider-badge">${providerLabel}</span>
        <span class="publication-type ${typeClass}">${labelType(publication.type)}</span>
        <span class="publication-date">${date}</span>
      </div>
      <div class="publication-author">${escapeHtml(author)}</div>
      <div class="publication-text">${escapeHtml(text)}</div>
      <div class="publication-metrics">
        <span><strong${metrics.like_count > 10 ? ' class="metric-highlight"' : ""}>${fmt(metrics.like_count)}</strong> curtidas</span>
        <span><strong>${fmt(metrics.comment_count)}</strong> comentários</span>
        <span><strong>${fmt(metrics.repost_count)}</strong> reposts</span>
        <span><strong>${fmt(metrics.view_count)}</strong> views</span>
      </div>
    `;

    card.addEventListener("click", () => {
      if (publication.url) chrome.tabs.create({ url: publication.url });
    });

    publicationList.appendChild(card);
  }
}

function handleExport() {
  chrome.runtime.sendMessage(
    { action: "GET_EXPORT", provider: activeProvider },
    (data: ExportJSON | undefined) => {
      if (!data) return;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const handle =
        data.tracked_profiles.instagram?.username ||
        data.tracked_profiles.x?.username ||
        data.tracked_account?.screen_name ||
        "export";
      a.href = url;
      a.download = `he4rt-social-${handle}-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  );
}

function handleClear() {
  chrome.runtime.sendMessage({ action: "CLEAR_ALL" }, () => {
    loadPublications();
    loadEndpoints();
  });
}

function loadEndpoints() {
  chrome.runtime.sendMessage(
    { action: "GET_ENDPOINTS", provider: activeProvider },
    (r: EndpointsResponse | undefined) => {
      if (!r) return;
      renderEndpoints(r.endpoints || {});
    },
  );
}

function renderEndpoints(
  endpoints: Record<string, Pick<EndpointStore, "count" | "endpoint" | "lastSeen" | "provider">>,
) {
  const names = Object.keys(endpoints);
  endpointCountEl.textContent = `${names.length} ${plural(names.length, "captura", "capturas")}`;
  copyAllBtn.disabled = names.length === 0;

  if (!names.length) {
    emptyEndpoints.classList.remove("hidden");
    endpointList.classList.add("hidden");
    return;
  }

  emptyEndpoints.classList.add("hidden");
  endpointList.classList.remove("hidden");
  endpointList.innerHTML = "";

  for (const name of names.sort(
    (a, b) => (endpoints[b]?.count || 0) - (endpoints[a]?.count || 0),
  )) {
    const ep = endpoints[name];
    if (!ep) continue;
    const card = document.createElement("div");
    card.className = "endpoint-card";
    card.innerHTML = `
      <div class="endpoint-info">
        <div class="endpoint-name">${escapeHtml(ep.provider)}:${escapeHtml(ep.endpoint)}</div>
        <div class="endpoint-meta">${ep.lastSeen ? new Date(ep.lastSeen).toLocaleTimeString("pt-BR") : ""}</div>
      </div>
      <span class="endpoint-count">${ep.count}</span>
      <button class="endpoint-copy" data-ep="${escapeHtml(name)}">Copiar</button>
    `;
    card.querySelector(".endpoint-copy")?.addEventListener("click", (e) => {
      e.stopPropagation();
      copyEndpoint(name, e.target as HTMLButtonElement);
    });
    endpointList.appendChild(card);
  }
}

function copyEndpoint(name: string, btn: HTMLButtonElement) {
  chrome.runtime.sendMessage(
    { action: "GET_ENDPOINT_PAYLOADS", endpoint: name },
    (r: EndpointPayloadsResponse | undefined) => {
      if (!r?.payloads?.length) return;
      navigator.clipboard.writeText(JSON.stringify(r.payloads, null, 2)).then(() => {
        const original = btn.textContent;
        btn.textContent = "OK!";
        setTimeout(() => {
          btn.textContent = original;
        }, 1200);
      });
    },
  );
}

function handleCopyAll() {
  chrome.runtime.sendMessage(
    { action: "GET_ALL_RAW", provider: activeProvider },
    (r: AllRawResponse | undefined) => {
      if (!r?.endpoints) return;
      navigator.clipboard.writeText(JSON.stringify(r.endpoints, null, 2)).then(() => {
        const original = copyAllBtn.textContent;
        copyAllBtn.textContent = "OK!";
        setTimeout(() => {
          copyAllBtn.textContent = original;
        }, 1200);
      });
    },
  );
}

function labelType(type: SocialPublication["type"]) {
  const labels: Record<SocialPublication["type"], string> = {
    carousel: "carrossel",
    image: "imagem",
    original: "original",
    quote: "quote",
    reel: "reel",
    reply: "resposta",
    repost: "repost",
    retweet: "retweet",
    unknown: "tipo incerto",
    video: "video",
  };
  return labels[type] || type;
}

function plural(count: number, singular: string, pluralText: string) {
  return count === 1 ? singular : pluralText;
}

function formatDate(str: string) {
  try {
    const d = new Date(str);
    const day = d.getDate().toString().padStart(2, "0");
    const mon = (d.getMonth() + 1).toString().padStart(2, "0");
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${day}/${mon} ${h}:${m}`;
  } catch {
    return str;
  }
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function escapeHtml(s: string) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
