import type { ActiveFetchFacet } from "../capture/active-fetch";
import type { BackgroundProviderFacet } from "../providers/contract";
import {
  instagramPlaceholderPublication,
  instagramProvider,
  processVisibleInstagramComments,
  visibleInstagramItemsForHandle,
} from "../providers/instagram";
import { linkedinProvider } from "../providers/linkedin";
import { linkedinActiveFetchFacet } from "../providers/linkedin/active-fetch/facet";
import { publicationKey } from "../providers/shared/utils";
import { xProvider } from "../providers/x";
import type {
  BackgroundStore,
  ExportJSON,
  ExportV3Meta,
  InstagramStore,
  LinkedInStore,
  NormalizedStore,
  SocialProvider,
  XStore,
} from "../shared/domain";
import type { CapturedPayloadMessage, RuntimeMessage } from "../shared/messages";
import { sortPublications } from "../shared/sort";
import { getActiveFetchStatus, runActiveFetch } from "./active-fetch";
import { recordRawPayload, storePublication } from "./store";

export type MessageContext = {
  log?: (message: string) => void;
  persistHandle?: (handle: string) => void;
};

function emptyXStore(): XStore {
  return {
    tweets: {},
    favoriters: {},
    accountInfo: null,
    communityReplies: {},
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
  };
}

function emptyInstagramStore(): InstagramStore {
  return {
    publicationIdsByShortcode: {},
    visiblePublications: [],
    visibleComments: [],
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
  };
}

function emptyLinkedInStore(): LinkedInStore {
  return {
    // Shape normalizado (alinhado a x/instagram): publications/comments/engagements
    // do LinkedIn vivem aqui, populados pelo write path per-platform.
    publications: {},
    commentsByPublication: {},
    engagementsByPublication: {},
    // Riqueza bespoke do LinkedIn (reaction_breakdown, feedOrder, reposts, etc.).
    extra: {
      posts: {},
      reactions: {},
      reposts: {},
      comments: {},
      commentReactions: {},
      accountInfo: null,
      feedOrder: [],
    },
  };
}

export function createStore(trackedHandle = ""): BackgroundStore {
  return {
    activeProvider: null,
    archivedEndpoints: {},
    trackedHandle,
    endpoints: {},
    platforms: {
      x: emptyXStore(),
      instagram: emptyInstagramStore(),
      linkedin: emptyLinkedInStore(),
    },
    lastUpdated: null,
    nextCaptureOrder: 1,
    pageSessionKey: "",
    pageSessionKeys: {},
    providerPageUrls: {},
    trackedHandles: {},
    trackedProfiles: {},
    provenance: {},
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// getEndpointStore → src/background/store.ts

function normalizeCapture(request: RuntimeMessage): CapturedPayloadMessage | null {
  if (request.action === "CAPTURED_PAYLOAD") return request;
  if (request.action === "GRAPHQL_CAPTURED") {
    return {
      action: "CAPTURED_PAYLOAD",
      provider: request.provider || "x",
      endpoint: request.endpoint,
      payload: request.payload,
      timestamp: request.timestamp,
      pageUrl: request.pageUrl,
      url: request.url,
    };
  }
  return null;
}

// emptyMetrics → src/background/store.ts

// storePublication / storeComment / storeEngagement → src/background/store.ts

// ---------------------------------------------------------------------------
// Capture processing
// ---------------------------------------------------------------------------

// trackedHandleForProvider → src/background/store.ts

// processXCapture → src/providers/x/index.ts

// instagramShortcodeFromUrl / resolveInstagramPublicationId / instagramPublicationAllowedForComments → src/providers/instagram/index.ts

// instagramPlaceholderPublication / migratePublicationRelations / processInstagramCapture → src/providers/instagram/index.ts

// processLinkedInCapture / findLinkedInPublicationByUrn → src/providers/linkedin/index.ts

// Registry de processamento por provider — o dispatch deixa de ser if-cascade.
// Adicionar um provider passa a ser registrar sua faceta aqui (e, nas próximas fatias,
// movê-la para src/providers/<id>/).
const BACKGROUND_PROVIDERS: Record<SocialProvider, BackgroundProviderFacet> = {
  x: xProvider,
  instagram: instagramProvider,
  linkedin: linkedinProvider,
};

// Registro PARALELO a BACKGROUND_PROVIDERS para o caminho ATIVO (Active Fetch / L3).
// Parcial: só providers que declaram aprofundamento on-demand aparecem aqui. O scheduler
// (src/background/active-fetch.ts, #17) itera este registry — sem `if` por rede.
export const ACTIVE_FETCH_FACETS: Partial<Record<SocialProvider, ActiveFetchFacet>> = {
  linkedin: linkedinActiveFetchFacet,
};

// ---------------------------------------------------------------------------
// Visible Instagram helpers
// ---------------------------------------------------------------------------

// visibleInstagramItemsForHandle / processVisibleInstagramComments → src/providers/instagram/index.ts

// recordRawPayload → src/background/store.ts

// ---------------------------------------------------------------------------
// Clear / reprocess
// ---------------------------------------------------------------------------

function clearDisplayedData(store: BackgroundStore) {
  const trackedHandle = store.trackedHandle;
  const trackedHandles = { ...store.trackedHandles };
  const activeProvider = store.activeProvider;
  const pageSessionKeys = store.pageSessionKeys;
  const providerPageUrls = store.providerPageUrls;
  const archivedEndpoints = { ...store.archivedEndpoints, ...store.endpoints };
  Object.assign(store, createStore(trackedHandle));
  store.trackedHandles = trackedHandles;
  store.activeProvider = activeProvider;
  store.pageSessionKeys = pageSessionKeys;
  store.providerPageUrls = providerPageUrls;
  store.archivedEndpoints = archivedEndpoints;
  store.lastUpdated = new Date().toISOString();
}

function clearNormalizedData(store: BackgroundStore) {
  // Per-platform stores (fonte única após a remoção do dual-write). O reprocess
  // depende disso para reconstruir os dados derivados a partir dos payloads crus.
  store.platforms.x = emptyXStore();
  store.platforms.instagram = emptyInstagramStore();
  // LinkedIn: preserva o accountInfo (vem do feed e alimenta trackedAccountUrn),
  // zera o restante para reconstrução limpa.
  const linkedinAccountInfo = store.platforms.linkedin.extra.accountInfo;
  store.platforms.linkedin = emptyLinkedInStore();
  store.platforms.linkedin.extra.accountInfo = linkedinAccountInfo;

  store.trackedProfiles = {};
  store.provenance = {};
  store.nextCaptureOrder = 1;
}

function activateContext(
  store: BackgroundStore,
  provider: null | SocialProvider,
  pageUrl?: string,
) {
  store.activeProvider = provider;
  if (provider && pageUrl) store.providerPageUrls[provider] = pageUrl;
  store.lastUpdated = new Date().toISOString();
}

function reprocessPayloads(store: BackgroundStore) {
  // Save visible state per provider before clearing.
  const savedVisible: Record<string, unknown> = {};
  for (const p of NORMALIZED_PLATFORMS) {
    if (p === "instagram") {
      savedVisible[p] = {
        visiblePublications: [...store.platforms.instagram.visiblePublications],
        visibleComments: [...store.platforms.instagram.visibleComments],
      };
    }
  }

  const providerPageUrls = { ...store.providerPageUrls };
  const pageSessionKeys = { ...store.pageSessionKeys };
  const trackedHandles = { ...store.trackedHandles };
  const cachedEndpoints = { ...store.archivedEndpoints, ...store.endpoints };
  const payloads = Object.values(cachedEndpoints).flatMap((endpoint) =>
    endpoint.payloads.map((payload) => ({
      action: "CAPTURED_PAYLOAD" as const,
      provider: endpoint.provider,
      endpoint: endpoint.endpoint,
      pageUrl: providerPageUrls[endpoint.provider],
      payload,
      timestamp: endpoint.lastSeen || new Date().toISOString(),
    })),
  );

  clearNormalizedData(store);

  // Restore visible state per provider via dispatch hooks.
  for (const p of NORMALIZED_PLATFORMS) {
    BACKGROUND_PROVIDERS[p].restoreVisibleData?.(store, savedVisible[p]);
  }

  store.pageSessionKeys = pageSessionKeys;
  store.providerPageUrls = providerPageUrls;
  store.trackedHandles = trackedHandles;

  // Re-seed Instagram visible placeholders (genérico — delega ao provider).
  if (savedVisible["instagram"]) {
    const { visiblePublications } = savedVisible["instagram"] as {
      visiblePublications: InstagramStore["visiblePublications"];
    };
    visibleInstagramItemsForHandle(store, visiblePublications).forEach((item, index) => {
      storePublication(store, instagramPlaceholderPublication(item, index + 1));
    });
  }

  for (const p of payloads) {
    BACKGROUND_PROVIDERS[p.provider].processCapture(store, p);
  }

  // Re-process visible comments per provider via dispatch hooks.
  for (const p of NORMALIZED_PLATFORMS) {
    BACKGROUND_PROVIDERS[p].reprocessVisibleComments?.(store, savedVisible[p]);
  }
}

// ---------------------------------------------------------------------------
// Export v3
// ---------------------------------------------------------------------------

function buildExportJSON(store: BackgroundStore): ExportJSON {
  // Cross-provider engager rollup (genérico).
  const xEngs = Object.values(store.platforms.x.engagementsByPublication).flat();
  const igEngs = Object.values(store.platforms.instagram.engagementsByPublication).flat();
  const liExtra = store.platforms.linkedin.extra;
  const liEngagers = new Set<string>();
  for (const entry of Object.values(liExtra.reactions))
    for (const u of entry.users) liEngagers.add(u.provider_user_id || u.username);
  for (const entry of Object.values(liExtra.reposts))
    for (const u of entry.users) liEngagers.add(u.urn || u.activity_urn || "");
  for (const entry of Object.values(liExtra.comments))
    for (const c of entry.items) liEngagers.add(c.author.provider_user_id || c.author.username);

  const allEngagers = new Set([
    ...xEngs.map((e) => e.actor.provider_user_id || e.actor.username),
    ...igEngs.map((e) => e.actor.provider_user_id || e.actor.username),
    ...liEngagers,
  ]);

  // Per-platform export data via dispatch hooks.
  const perPlatform = {
    x: BACKGROUND_PROVIDERS.x.buildExportPlatformData!(store),
    instagram: BACKGROUND_PROVIDERS.instagram.buildExportPlatformData!(store),
    linkedin: BACKGROUND_PROVIDERS.linkedin.buildExportPlatformData!(store),
  } as ExportJSON["per_platform"];

  // Per-platform summaries via dispatch hooks.
  const byPlatform = {
    x: BACKGROUND_PROVIDERS.x.computeExportSummary!(store),
    instagram: BACKGROUND_PROVIDERS.instagram.computeExportSummary!(store),
    linkedin: BACKGROUND_PROVIDERS.linkedin.computeExportSummary!(store),
  } as ExportJSON["unified"]["summary"]["by_platform"];

  return {
    schema_version: 3,
    meta: {
      exported_at: new Date().toISOString(),
      handles: { ...store.trackedHandles, _: store.trackedHandle } as ExportV3Meta["handles"],
      profiles: {
        instagram: store.trackedProfiles.instagram || { username: store.trackedHandle },
        linkedin: store.trackedProfiles.linkedin || { username: store.trackedHandle },
        x: store.trackedProfiles.x || { username: store.trackedHandle },
      },
    },
    per_platform: perPlatform,
    unified: {
      summary: {
        all: {
          total_content:
            Object.values(store.platforms.x.publications).length +
            Object.values(store.platforms.instagram.publications).length +
            Object.values(liExtra.posts).length,
          total_likes:
            Object.values(store.platforms.x.publications).reduce(
              (s, p) => s + p.metrics.like_count,
              0,
            ) +
            Object.values(store.platforms.instagram.publications).reduce(
              (s, p) => s + p.metrics.like_count,
              0,
            ) +
            Object.values(liExtra.posts).reduce((s, p) => s + p.metrics.like_count, 0),
          total_comments:
            Object.values(store.platforms.x.commentsByPublication).flat().length +
            Object.values(store.platforms.instagram.commentsByPublication).flat().length +
            Object.values(liExtra.posts).reduce((s, p) => s + p.metrics.comment_count, 0),
          unique_engagers: allEngagers.size,
        },
        by_platform: byPlatform,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// storeForProvider (legacy compat)
// ---------------------------------------------------------------------------

function storeForProvider(store: BackgroundStore, provider: null | SocialProvider) {
  if (!provider) return store;
  // buildExportJSON já lê exclusivamente store.platforms.* + handles/profiles, então
  // o store escopado só precisa montar platforms[provider] real (demais vazios) e
  // carregar os metadados compartilhados. Sem mais cópia de stores planos.
  const scoped = createStore(store.trackedHandle);
  scoped.activeProvider = store.activeProvider;
  scoped.lastUpdated = store.lastUpdated;
  scoped.nextCaptureOrder = store.nextCaptureOrder;
  scoped.pageSessionKey = store.pageSessionKey;
  scoped.pageSessionKeys = store.pageSessionKeys;
  scoped.providerPageUrls = store.providerPageUrls;
  scoped.endpoints = Object.fromEntries(
    Object.entries(store.endpoints).filter(([, e]) => e.provider === provider),
  );
  scoped.trackedProfiles = store.trackedProfiles[provider]
    ? { [provider]: store.trackedProfiles[provider] }
    : {};

  scoped.platforms = { ...scoped.platforms, [provider]: store.platforms[provider] };
  return scoped;
}

// Leitores per-platform para GET_PUBLICATIONS/GET_TWEETS (substituem os flats).
// Quando provider é null, faz a UNIÃO dos três stores normalizados — preservando
// os totais cross-provider que os testes verificam.
const NORMALIZED_PLATFORMS: SocialProvider[] = ["x", "instagram", "linkedin"];

function platformsForProvider(provider: null | SocialProvider): SocialProvider[] {
  return provider ? [provider] : NORMALIZED_PLATFORMS;
}

function collectPublications(store: BackgroundStore, provider: null | SocialProvider) {
  return platformsForProvider(provider).flatMap((p) =>
    Object.values((store.platforms[p] as NormalizedStore).publications),
  );
}

function collectComments(store: BackgroundStore, provider: null | SocialProvider) {
  return platformsForProvider(provider).flatMap((p) =>
    Object.values((store.platforms[p] as NormalizedStore).commentsByPublication).flat(),
  );
}

function collectEngagements(store: BackgroundStore, provider: null | SocialProvider) {
  return platformsForProvider(provider).flatMap((p) =>
    Object.values((store.platforms[p] as NormalizedStore).engagementsByPublication).flat(),
  );
}

// Total de publicações somando os três stores normalizados per-platform.
function totalPublicationCount(store: BackgroundStore) {
  return NORMALIZED_PLATFORMS.reduce(
    (sum, p) => sum + Object.keys((store.platforms[p] as NormalizedStore).publications).length,
    0,
  );
}

// Publicações consolidadas de UM provider (não cumulativo entre plataformas). Usado no
// log de captura para mostrar o total daquela rede, não a soma global (que confundia).
function providerPublicationCount(store: BackgroundStore, provider: SocialProvider) {
  return Object.keys((store.platforms[provider] as NormalizedStore).publications).length;
}

function endpointSummary(store: BackgroundStore) {
  const summary: Record<
    string,
    { count: number; endpoint: string; lastSeen: null | string; provider: SocialProvider }
  > = {};
  for (const [name, ep] of Object.entries(store.endpoints)) {
    summary[name] = {
      provider: ep.provider,
      endpoint: ep.endpoint,
      count: ep.count,
      lastSeen: ep.lastSeen,
    };
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

export function handleRuntimeMessage(
  store: BackgroundStore,
  request: RuntimeMessage,
  context: MessageContext = {},
): unknown {
  // Provider context
  if (request.action === "SET_ACTIVE_PROVIDER") {
    const prev = store.activeProvider;
    activateContext(store, request.provider, request.pageUrl);
    if (prev !== request.provider)
      context.log?.(`[Social Interceptor] provider ativo: ${request.provider || "nenhum"}`);
    return { activeProvider: store.activeProvider, success: true };
  }

  if (request.action === "PAGE_SESSION_STARTED") {
    activateContext(store, request.provider, request.pageUrl);
    store.providerPageUrls[request.provider] = request.pageUrl;
    if (store.pageSessionKeys[request.provider] !== request.sessionKey) {
      store.activeProvider = request.provider;
      store.providerPageUrls[request.provider] = request.pageUrl;
      store.pageSessionKey = request.sessionKey;
      store.pageSessionKeys[request.provider] = request.sessionKey;
      store.lastUpdated = new Date().toISOString();
      context.log?.(`[Social Interceptor] nova sessão de página: ${request.pageUrl}`);
    }
    return { success: true };
  }

  // Instagram visible data
  if (request.action === "VISIBLE_PUBLICATIONS") {
    const items: InstagramStore["visiblePublications"] = request.items?.length
      ? request.items
      : request.shortcodes.map((s) => ({ shortcode: s, url: `https://www.instagram.com/p/${s}/` }));
    const istore = store.platforms.instagram;
    const filteredItems = visibleInstagramItemsForHandle(store, items);
    istore.visiblePublications = filteredItems;
    filteredItems.forEach((item, index) => {
      const publicationId =
        istore.publicationIdsByShortcode[item.shortcode] || `shortcode:${item.shortcode}`;
      const key = publicationKey("instagram", publicationId);
      const pub = istore.publications[key];
      if (pub) {
        pub.visible_order = index + 1;
        pub.visible_url = item.url;
        if (pub.is_placeholder) {
          pub.text = pub.text || item.text || "";
          pub.type = pub.type === "unknown" && item.mediaType ? item.mediaType : pub.type;
          pub.author = {
            ...pub.author,
            username: pub.author.username || item.author?.username || "",
            name: pub.author.name || item.author?.name || item.author?.username || "",
            avatar_url: pub.author.avatar_url || item.author?.avatar_url || "",
          };
          pub.metrics.comment_count ||= item.metrics?.comment_count || 0;
          pub.metrics.reply_count = pub.metrics.comment_count;
          pub.metrics.like_count ||= item.metrics?.like_count || 0;
        }
        if (!pub.url) pub.url = item.url;
        return;
      }
      storePublication(store, instagramPlaceholderPublication(item, index + 1));
    });
    store.lastUpdated = new Date().toISOString();
    return { success: true };
  }

  if (request.action === "VISIBLE_COMMENTS") {
    processVisibleInstagramComments(store, request);
    return { success: true };
  }

  // Capture
  const capture = normalizeCapture(request);
  if (capture) {
    if (capture.pageUrl) store.providerPageUrls[capture.provider] = capture.pageUrl;
    recordRawPayload(store, capture.provider, capture.endpoint, capture.payload, capture.timestamp);
    // Delta por-captura: quantas publicações ESTA captura adicionou ao store do provider
    // (vs. o total cumulativo de todas as redes, que não dizia nada sobre a captura).
    const before = providerPublicationCount(store, capture.provider);
    BACKGROUND_PROVIDERS[capture.provider].processCapture(store, capture);
    const added = providerPublicationCount(store, capture.provider) - before;
    context.log?.(
      `[He4rt Analytics] [store] ${capture.provider}:${capture.endpoint} · +${added} ` +
        `(total ${capture.provider}: ${providerPublicationCount(store, capture.provider)})`,
    );
    return { success: true };
  }

  // Handle management (legacy single)
  if (request.action === "SET_HANDLE") {
    const provider = request.provider ?? store.activeProvider;
    if (provider || request.pageUrl) activateContext(store, provider, request.pageUrl);
    store.trackedHandle = request.handle;
    if (provider) store.trackedHandles[provider] = request.handle;
    context.persistHandle?.(request.handle);
    reprocessPayloads(store);
    return {
      success: true,
      publicationCount: totalPublicationCount(store),
      tweetCount: Object.keys(store.platforms.x.tweets).length,
    };
  }

  if (request.action === "GET_HANDLE") {
    const provider = Object.hasOwn(request, "provider") ? request.provider : null;
    return { handle: provider ? store.trackedHandles[provider] || "" : store.trackedHandle };
  }

  // Publications (legacy)
  if (request.action === "GET_PUBLICATIONS" || request.action === "GET_TWEETS") {
    const provider = request.provider ?? store.activeProvider;
    const xstore = store.platforms.x;
    const publications = sortPublications(collectPublications(store, provider));
    const comments = collectComments(store, provider);
    const engagements = collectEngagements(store, provider);
    const xScoped = !provider || provider === "x";
    return {
      publications,
      commentsCount: comments.length,
      engagementsCount: engagements.length,
      tweets: xScoped
        ? Object.values(xstore.tweets).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
        : [],
      replyCount: xScoped ? Object.keys(xstore.communityReplies).length : 0,
      accountInfo: xScoped ? xstore.accountInfo : null,
      trackedProfiles: store.trackedProfiles,
      lastUpdated: store.lastUpdated,
    };
  }

  // Export (legacy v2 - kept for compatibility)
  if (request.action === "GET_EXPORT") {
    if (request.provider) {
      return buildExportJSON(storeForProvider(store, request.provider ?? store.activeProvider));
    }
    return buildExportJSON(store);
  }

  // Endpoints
  if (request.action === "GET_ENDPOINTS") {
    const provider = request.provider ?? store.activeProvider;
    return {
      endpoints: Object.fromEntries(
        Object.entries(endpointSummary(store)).filter(
          ([, ep]) => !provider || ep.provider === provider,
        ),
      ),
      lastUpdated: store.lastUpdated,
    };
  }

  if (request.action === "GET_ENDPOINT_PAYLOADS") {
    const ep =
      store.endpoints[request.endpoint] ||
      Object.values(store.endpoints).find((e) => e.endpoint === request.endpoint);
    return { payloads: ep ? ep.payloads : [] };
  }

  if (request.action === "GET_ALL_RAW") {
    const provider = request.provider ?? store.activeProvider;
    return {
      endpoints: Object.fromEntries(
        Object.entries(store.endpoints).filter(([, ep]) => !provider || ep.provider === provider),
      ),
    };
  }

  // Clear
  if (request.action === "CLEAR_ALL") {
    clearDisplayedData(store);
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // NEW: Multi-platform popup messages
  // -----------------------------------------------------------------------

  if (request.action === "GET_HANDLES") {
    return { handles: store.trackedHandles };
  }

  if (request.action === "SET_HANDLES") {
    for (const [provider, handle] of Object.entries(request.handles)) {
      if (handle !== undefined) {
        store.trackedHandles[provider as SocialProvider] = handle;
      }
    }
    const firstHandle = Object.values(request.handles).find(Boolean) || "";
    if (firstHandle) store.trackedHandle = firstHandle;
    context.persistHandle?.(firstHandle);
    reprocessPayloads(store);
    return { success: true };
  }

  if (request.action === "GET_PLATFORM_DATA") {
    const handler = BACKGROUND_PROVIDERS[request.provider]?.buildPlatformData;
    if (handler) return handler(store);
    return {
      type: "unknown",
      publications: [],
      commentsByPublication: {},
      engagementsByPublication: {},
    };
  }

  if (request.action === "GET_ALL_SUMMARY") {
    const byPlatform: Record<string, { content_count: number; engager_count: number }> = {};
    let totalContent = 0;

    for (const p of NORMALIZED_PLATFORMS) {
      const summary = BACKGROUND_PROVIDERS[p].computePopupSummary?.(store);
      if (summary) {
        byPlatform[p] = summary;
        totalContent += summary.content_count;
      }
    }

    // Cross-provider engager rollup: coleta engagers de todas as redes num Set
    // unificado para contar únicos. A lógica de coleta é genérica (itera o mesmo
    // store que os providers usam), sem leakage de lógica específica.
    const allEngagers = new Set<string>();
    for (const favs of Object.values(store.platforms.x.favoriters)) {
      for (const f of favs) allEngagers.add(f.rest_id || f.screen_name);
    }
    for (const e of Object.values(store.platforms.instagram.engagementsByPublication).flat()) {
      allEngagers.add(e.actor.provider_user_id || e.actor.username);
    }
    const liExtra = store.platforms.linkedin.extra;
    for (const entry of Object.values(liExtra.reactions))
      for (const u of entry.users) allEngagers.add(u.provider_user_id || u.username);
    for (const entry of Object.values(liExtra.reposts))
      for (const u of entry.users) allEngagers.add(u.urn || u.activity_urn || "");
    for (const entry of Object.values(liExtra.comments))
      for (const c of entry.items) allEngagers.add(c.author.provider_user_id || c.author.username);

    return {
      total_content: totalContent,
      total_engagers: allEngagers.size,
      by_platform: byPlatform,
      lastUpdated: store.lastUpdated,
    };
  }

  if (request.action === "GET_RAW_PAYLOADS") {
    const provider = request.provider;
    return {
      endpoints: Object.fromEntries(
        Object.entries(store.endpoints).filter(([, ep]) => !provider || ep.provider === provider),
      ),
    };
  }

  if (request.action === "DETECT_TARGET") {
    const profile = BACKGROUND_PROVIDERS[request.provider]?.scopeModes.find(
      (mode) => mode.id === "profile",
    );
    const target = profile?.detectFromPage?.(request.pageUrl) ?? null;
    return { mode: "profile", target };
  }

  // Active Fetch (L3) — #16/#17. RUN dispara o scheduler (Promise<ActiveFetchStatus>);
  // GET é o polling síncrono do singleton de status. A lógica de fan-out vive em
  // src/background/active-fetch.ts (sem inchar o controller).
  if (request.action === "RUN_ACTIVE_FETCH") {
    // Default seguro: sem `dryRun` explícito, NÃO origina tráfego (gate de ToS).
    return runActiveFetch(store, request.provider, request.dryRun ?? true);
  }

  if (request.action === "GET_ACTIVE_FETCH_STATUS") {
    return getActiveFetchStatus(request.provider);
  }

  return undefined;
}
