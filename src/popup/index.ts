import { PROVIDER_METAS } from "../providers/meta";
import type {
  EndpointStore,
  ExportJSON,
  ExportLinkedInPost,
  SocialComment,
  SocialEngagement,
  SocialProvider,
  SocialPublication,
} from "../shared/domain";
import { sortPublications } from "../shared/sort";

type ProviderData = {
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
  type: SocialProvider;
};

type LinkedInProviderData = {
  type: "linkedin";
  content: ExportLinkedInPost[];
  lastUpdated: string | null;
};

type AllSummary = {
  total_content: number;
  total_engagers: number;
  by_platform: Record<string, { content_count: number; engager_count: number }>;
  lastUpdated: string | null;
};

type RawPayloads = {
  endpoints: Record<string, EndpointStore>;
};

type HandlesMap = Partial<Record<SocialProvider, string>>;

type PlatformTabConfig = {
  prefix: string;
  provider: SocialProvider;
  color: string;
  name: string;
};

const TABS: PlatformTabConfig[] = PROVIDER_METAS.map((meta) => ({
  prefix: meta.popupPrefix,
  provider: meta.id,
  color: meta.color,
  name: meta.name,
}));

let refreshSequence = 0;

document.addEventListener("DOMContentLoaded", () => {
  loadHandles();
  setupTabClicks();
  setupButtons();
  setupListeners();
  autoSelectTab();
  suggestCollectionTarget();
});

const HOST_TAB_MAP: Array<{ host: string; tab: string }> = PROVIDER_METAS.flatMap((meta) =>
  meta.hosts.map((host) => ({ host, tab: meta.id })),
);

function switchTab(tabId: string) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.remove("active");
  });
  document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add("active");
  document.querySelectorAll(".tab-content").forEach((c) => {
    c.classList.add("hidden");
  });
  document.getElementById(`tab-${tabId}`)?.classList.remove("hidden");

  if (tabId === "all") loadAllSummary();
  else if (tabId === "config") loadHandles();
  else loadPlatformData(tabId as SocialProvider);

  renderCollectionTarget();
}

function autoSelectTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.url) {
      switchTab("all");
      return;
    }
    const url = tabs[0].url;
    for (const { host, tab } of HOST_TAB_MAP) {
      if (url.includes(host)) {
        switchTab(tab);
        return;
      }
    }
    switchTab("all");
  });
}

// === Collection Target (#9) ===
// Sugere o alvo de coleta a partir da URL da aba ativa: pergunta ao background
// (DETECT_TARGET → detectFromPage do scopeModes.profile) e mostra um banner com o perfil
// detectado + botão para rastrear. Profile-only por enquanto (único modo).

const HANDLE_INPUT_IDS: Record<string, string> = {
  x: "handleX",
  instagram: "handleIg",
  linkedin: "handleLi",
};

function providerFromUrl(url: string): null | SocialProvider {
  for (const { host, tab } of HOST_TAB_MAP) {
    if (url.includes(host)) return tab as SocialProvider;
  }
  return null;
}

// Estado da última detecção (da aba do BROWSER ativa). O banner é global no popup, então
// só o exibimos quando a aba do POPUP ativa é a do provider detectado — senão o "Perfil
// detectado no X" apareceria também nas abas Instagram/LinkedIn/Resumo/Config.
let detectedTarget: { handles: HandlesMap; provider: SocialProvider; target: string } | null = null;

function activePopupTab(): null | string {
  return (document.querySelector(".tab.active") as HTMLElement | null)?.dataset.tab ?? null;
}

function suggestCollectionTarget() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url;
    const provider = url ? providerFromUrl(url) : null;
    if (!url || !provider) {
      detectedTarget = null;
      renderCollectionTarget();
      return;
    }
    chrome.runtime.sendMessage(
      { action: "DETECT_TARGET", provider, pageUrl: url },
      (res: { mode: string; target: null | string } | undefined) => {
        const target = res?.target ?? null;
        if (!target) {
          detectedTarget = null;
          renderCollectionTarget();
          return;
        }
        chrome.runtime.sendMessage(
          { action: "GET_HANDLES" },
          (handlesRes: { handles: HandlesMap } | undefined) => {
            detectedTarget = { provider, target, handles: handlesRes?.handles || {} };
            renderCollectionTarget();
          },
        );
      },
    );
  });
}

function renderCollectionTarget() {
  const banner = document.getElementById("collectionTarget");
  if (!banner) return;
  // Só exibe na aba do popup correspondente ao provider detectado.
  if (!detectedTarget || activePopupTab() !== detectedTarget.provider) {
    banner.classList.add("hidden");
    return;
  }
  const { provider, target, handles } = detectedTarget;
  const meta = TABS.find((t) => t.provider === provider);
  const label = meta?.name ?? provider;
  const color = meta?.color ?? "#888";
  const tracked = (handles[provider] || "").toLowerCase() === target.toLowerCase();
  const safeTarget = escapeHtml(target);
  banner.classList.remove("hidden");

  if (tracked) {
    banner.innerHTML = `<span class="ct-dot" style="background:${color}"></span><span class="ct-text">Coletando <strong>${safeTarget}</strong> no ${label} · modo Profile</span>`;
    return;
  }

  banner.innerHTML = `<span class="ct-dot" style="background:${color}"></span><span class="ct-text">Perfil detectado: <strong>${safeTarget}</strong></span><button id="ctTrackBtn" class="btn btn-xs" type="button">Rastrear</button>`;
  document.getElementById("ctTrackBtn")?.addEventListener("click", () => {
    const merged: HandlesMap = { ...handles, [provider]: target };
    chrome.runtime.sendMessage({ action: "SET_HANDLES", handles: merged }, () => {
      const input = document.getElementById(
        HANDLE_INPUT_IDS[provider] || "",
      ) as HTMLInputElement | null;
      if (input) input.value = target;
      suggestCollectionTarget();
      loadPlatformData(provider);
    });
  });
}

function setupTabClicks() {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab || "all");
    });
  });
}

function setupButtons() {
  TABS.forEach(({ prefix, provider }) => {
    document
      .getElementById(`${prefix}ExportBtn`)
      ?.addEventListener("click", () => exportPlatform(provider));
    document
      .getElementById(`${prefix}ExportRawBtn`)
      ?.addEventListener("click", () => exportRaw(provider));
    document
      .getElementById(`${prefix}ClearBtn`)
      ?.addEventListener("click", () => clearPlatform(provider));
  });

  document.getElementById("allExportBtn")?.addEventListener("click", () => exportPlatform(null));
  document.getElementById("allExportRawBtn")?.addEventListener("click", () => exportRaw(null));
  document.getElementById("saveHandlesBtn")?.addEventListener("click", saveHandles);

  ["handleX", "handleIg", "handleLi"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveHandles();
    });
  });
}

function setupListeners() {
  chrome.runtime.onMessage.addListener((message: { action?: string }) => {
    if (message.action === "STORE_UPDATED") {
      const active = document.querySelector(".tab.active") as HTMLElement | null;
      const tab = active?.dataset.tab;
      if (tab === "x") loadPlatformData("x");
      else if (tab === "instagram") loadPlatformData("instagram");
      else if (tab === "linkedin") loadPlatformData("linkedin");
      else if (tab === "all") loadAllSummary();
    }
  });

  chrome.tabs.onActivated?.addListener(() => {
    autoSelectTab();
    suggestCollectionTarget();
  });
  chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === "complete" || changeInfo.url) {
      autoSelectTab();
      suggestCollectionTarget();
    }
  });
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado`);
  return element as T;
}

// --- Platform data ---

function loadPlatformData(provider: SocialProvider) {
  const seq = ++refreshSequence;
  chrome.runtime.sendMessage({ action: "GET_PLATFORM_DATA", provider }, (response: unknown) => {
    if (seq !== refreshSequence) return;
    if (!response) return;
    if (provider === "linkedin") {
      renderLinkedIn(response as LinkedInProviderData);
    } else {
      renderProvider(response as ProviderData);
    }
  });
}

function renderProvider(data: ProviderData) {
  const config = TABS.find((t) => t.provider === data.type);
  if (!config) return;
  const { prefix } = config;
  const publications = data.publications ? Object.values(data.publications) : [];
  const sorted = sortPublications(publications);

  getElement(`${prefix}PublicationCount`).textContent =
    `${sorted.length} ${plural(sorted.length, "publicação", "publicações")}`;
  getExportBtn(prefix).disabled = sorted.length === 0;
  getExportRawBtn(prefix).disabled = sorted.length === 0;
  getClearBtn(prefix).disabled = sorted.length === 0;

  if (sorted.length === 0) {
    getElement(`${prefix}Empty`).classList.remove("hidden");
    getElement(`${prefix}List`).classList.add("hidden");
    return;
  }

  getElement(`${prefix}Empty`).classList.add("hidden");
  const list = getElement(`${prefix}List`);
  list.classList.remove("hidden");
  list.innerHTML = "";

  for (const pub of sorted) {
    const card = document.createElement("div");
    card.className = "publication-card";
    const typeClass = `publication-type-${pub.type}`;
    const date = pub.created_at ? formatDate(pub.created_at) : "";
    const author = pub.author.username ? `@${pub.author.username}` : "Publicação visível";
    const text =
      pub.text || (pub.is_placeholder ? "Dados básicos capturados pelo DOM" : "(sem legenda)");

    card.innerHTML = `
      <div class="publication-top">
        <span class="publication-type ${typeClass}">${labelType(pub.type)}</span>
        <span class="publication-date">${date}</span>
      </div>
      <div class="publication-author">${escapeHtml(author)}</div>
      <div class="publication-text">${escapeHtml(text)}</div>
      <div class="publication-metrics">
        <span><strong${pub.metrics.like_count > 10 ? ' class="metric-highlight"' : ""}>${fmt(pub.metrics.like_count)}</strong> curtidas</span>
        <span><strong>${fmt(pub.metrics.comment_count)}</strong> comentários</span>
        <span><strong>${fmt(pub.metrics.repost_count)}</strong> reposts</span>
        <span><strong>${fmt(pub.metrics.view_count)}</strong> views</span>
      </div>
    `;

    card.addEventListener("click", () => {
      if (pub.url) chrome.tabs.create({ url: pub.url });
    });

    list.appendChild(card);
  }
}

function renderLinkedIn(data: LinkedInProviderData) {
  const prefix = "li";
  const posts = data.content || [];

  getElement(`${prefix}PublicationCount`).textContent =
    `${posts.length} ${plural(posts.length, "publicação", "publicações")}`;
  getExportBtn(prefix).disabled = posts.length === 0;
  getExportRawBtn(prefix).disabled = posts.length === 0;
  getClearBtn(prefix).disabled = posts.length === 0;

  if (posts.length === 0) {
    getElement(`${prefix}Empty`).classList.remove("hidden");
    getElement(`${prefix}List`).classList.add("hidden");
    return;
  }

  getElement(`${prefix}Empty`).classList.add("hidden");
  const list = getElement(`${prefix}List`);
  list.classList.remove("hidden");
  list.innerHTML = "";

  for (const post of posts) {
    const card = document.createElement("div");
    card.className = "publication-card";
    const date = post.created_at ? formatDate(post.created_at) : "";
    const author = post.author.name || post.author.vanity_name || "Visível";
    const text = post.text || "(sem texto)";
    const engagers = post.engagers || { reactions: {}, reposts: {}, comments: {} };
    const r = toEngagerSummary(engagers.reactions);
    const rp = toEngagerSummary(engagers.reposts);
    const c = toEngagerSummary(engagers.comments);

    card.innerHTML = `
      <div class="publication-top">
        <span class="publication-type publication-type-${post.type}">${post.type === "repost" ? "repost" : "original"}</span>
        <span class="publication-date">${date}</span>
      </div>
      <div class="publication-author">${escapeHtml(author)}</div>
      <div class="publication-text">${escapeHtml(text)}</div>
      <div class="publication-metrics">
        <span><strong>${fmt(post.metrics.like_count)}</strong> curtidas</span>
        <span><strong>${fmt(post.metrics.comment_count)}</strong> comentários</span>
        <span><strong>${fmt(post.metrics.share_count)}</strong> compart.</span>
        <span><strong>${c}</strong> respostas capt.</span>
      </div>
      <div class="publication-metrics" style="margin-top:3px;font-size:10px;color:#536471">
        <span>reações: ${r}</span>
        <span>reposts: ${rp}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      const url = `https://www.linkedin.com/feed/update/${post.activity_urn}/`;
      chrome.tabs.create({ url });
    });

    list.appendChild(card);
  }
}

function toEngagerSummary(v: unknown): string {
  if (!v || typeof v !== "object") return "0";
  const obj = v as Record<string, unknown>;
  const captured = typeof obj.captured === "number" ? obj.captured : 0;
  const total = typeof obj.total === "number" ? obj.total : 0;
  return total > captured ? `${captured}/${total}` : `${captured}`;
}

// --- All tab ---

function loadAllSummary() {
  const seq = ++refreshSequence;
  chrome.runtime.sendMessage({ action: "GET_ALL_SUMMARY" }, (r: AllSummary | undefined) => {
    if (seq !== refreshSequence) return;
    if (!r) return;
    getElement("allTotal").textContent =
      `${r.total_content} ${plural(r.total_content, "publicação no total", "publicações no total")}`;
    getElement("allXCount").textContent = String(r.by_platform?.x?.content_count ?? 0);
    getElement("allIgCount").textContent = String(r.by_platform?.instagram?.content_count ?? 0);
    getElement("allLiCount").textContent = String(r.by_platform?.linkedin?.content_count ?? 0);

    const empty = getElement("allEmpty");
    if (r.total_content === 0) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
    }
  });
}

// --- Handles ---

function loadHandles() {
  chrome.runtime.sendMessage(
    { action: "GET_HANDLES" },
    (r: { handles: HandlesMap } | undefined) => {
      if (!r?.handles) return;
      (document.getElementById("handleX") as HTMLInputElement).value = r.handles.x || "";
      (document.getElementById("handleIg") as HTMLInputElement).value = r.handles.instagram || "";
      (document.getElementById("handleLi") as HTMLInputElement).value = r.handles.linkedin || "";
    },
  );
}

function saveHandles() {
  const x = (document.getElementById("handleX") as HTMLInputElement).value.trim().replace(/^@/, "");
  const ig = (document.getElementById("handleIg") as HTMLInputElement).value
    .trim()
    .replace(/^@/, "");
  const li = (document.getElementById("handleLi") as HTMLInputElement).value
    .trim()
    .replace(/^@/, "");
  (document.getElementById("handleX") as HTMLInputElement).value = x;
  (document.getElementById("handleIg") as HTMLInputElement).value = ig;
  (document.getElementById("handleLi") as HTMLInputElement).value = li;

  chrome.runtime.sendMessage(
    { action: "SET_HANDLES", handles: { x, instagram: ig, linkedin: li } },
    () => {
      const btn = document.getElementById("saveHandlesBtn") as HTMLButtonElement;
      const original = btn.textContent;
      btn.textContent = "Salvo!";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1200);
    },
  );
}

// --- Export ---

function exportPlatform(provider: SocialProvider | null) {
  chrome.runtime.sendMessage({ action: "GET_EXPORT", provider }, (data: ExportJSON | undefined) => {
    if (!data) return;
    downloadJson(data, exportFilename(data));
  });
}

function exportRaw(provider: SocialProvider | null) {
  chrome.runtime.sendMessage(
    { action: "GET_RAW_PAYLOADS", provider },
    (r: RawPayloads | undefined) => {
      if (!r?.endpoints) return;
      const handle = provider || "all";
      downloadJson(r.endpoints, `he4rt-raw-${handle}-${dateStamp()}.json`);
    },
  );
}

function clearPlatform(provider: SocialProvider) {
  chrome.runtime.sendMessage({ action: "CLEAR_ALL" }, () => {
    loadPlatformData(provider);
    loadAllSummary();
  });
}

function downloadJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportFilename(data: ExportJSON): string {
  const h = Object.values(data.meta?.handles || {}).find(Boolean) || "export";
  return `he4rt-social-${h}-${dateStamp()}.json`;
}

function dateStamp() {
  return new Date().toISOString().split("T")[0];
}

// --- Helpers ---

function labelType(type: string) {
  const labels: Record<string, string> = {
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

function getExportBtn(prefix: string): HTMLButtonElement {
  return getElement(`${prefix}ExportBtn`);
}
function getExportRawBtn(prefix: string): HTMLButtonElement {
  return getElement(`${prefix}ExportRawBtn`);
}
function getClearBtn(prefix: string): HTMLButtonElement {
  return getElement(`${prefix}ClearBtn`);
}
