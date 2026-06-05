import type { BackgroundStore, EndpointStore, SocialProvider } from "../shared/domain";
import type { RuntimeMessage } from "../shared/messages";
import { createStore, handleRuntimeMessage } from "./controller";

const LOCAL_KEYS = {
  endpoints: "he4rt_endpoints",
  trackedHandles: "he4rt_trackedHandles",
  archivedEndpoints: "he4rt_archivedEndpoints",
} as const;

const SESSION_KEY = "he4rt_platforms";

const store = createStore();

// ---------------------------------------------------------------------------
// Hydration: load from both storage areas
// ---------------------------------------------------------------------------

async function hydrate() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([
      LOCAL_KEYS.endpoints,
      LOCAL_KEYS.trackedHandles,
      LOCAL_KEYS.archivedEndpoints,
    ]),
    chrome.storage.session.get(SESSION_KEY),
  ]);

  // Restore persistent data
  if (local[LOCAL_KEYS.endpoints])
    store.endpoints = local[LOCAL_KEYS.endpoints] as Record<string, EndpointStore>;
  if (local[LOCAL_KEYS.trackedHandles])
    store.trackedHandles = local[LOCAL_KEYS.trackedHandles] as Partial<
      Record<SocialProvider, string>
    >;
  if (local[LOCAL_KEYS.archivedEndpoints])
    store.archivedEndpoints = local[LOCAL_KEYS.archivedEndpoints] as Record<string, EndpointStore>;

  // Restore volatile per-platform processed data (rebuildable from raw)
  const saved = session[SESSION_KEY];
  if (saved && typeof saved === "object") {
    const s = saved as Partial<BackgroundStore["platforms"]>;
    if (s.x) Object.assign(store.platforms.x, s.x);
    if (s.instagram) Object.assign(store.platforms.instagram, s.instagram);
    if (s.linkedin) Object.assign(store.platforms.linkedin, s.linkedin);
  }

  store.lastUpdated = new Date().toISOString();
}

const hydration = hydrate();

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

let persistQueue = Promise.resolve();

function persistSession(): Promise<void> {
  const snapshot = {
    x: store.platforms.x,
    instagram: store.platforms.instagram,
    linkedin: store.platforms.linkedin,
  };
  persistQueue = persistQueue
    .then(() => chrome.storage.session.set({ [SESSION_KEY]: snapshot }))
    .catch((err) => console.error("[He4rt Analytics] falha ao salvar session", err));
  return persistQueue;
}

function persistLocal(): Promise<void> {
  const data: Record<string, unknown> = {
    [LOCAL_KEYS.endpoints]: store.endpoints,
    [LOCAL_KEYS.trackedHandles]: store.trackedHandles,
    [LOCAL_KEYS.archivedEndpoints]: store.archivedEndpoints,
  };
  persistQueue = persistQueue
    .then(() => chrome.storage.local.set(data))
    .catch((err) => console.error("[He4rt Analytics] falha ao salvar local", err));
  return persistQueue;
}

function shouldPersistSession(request: RuntimeMessage) {
  return (
    request.action === "CAPTURED_PAYLOAD" ||
    request.action === "GRAPHQL_CAPTURED" ||
    request.action === "SET_HANDLE" ||
    request.action === "SET_HANDLES" ||
    request.action === "SET_ACTIVE_PROVIDER" ||
    request.action === "CLEAR_ALL" ||
    request.action === "PAGE_SESSION_STARTED" ||
    request.action === "VISIBLE_PUBLICATIONS" ||
    request.action === "VISIBLE_COMMENTS"
  );
}

function shouldPersistLocal(request: RuntimeMessage) {
  return (
    request.action === "CAPTURED_PAYLOAD" ||
    request.action === "GRAPHQL_CAPTURED" ||
    request.action === "SET_HANDLE" ||
    request.action === "SET_HANDLES" ||
    request.action === "CLEAR_ALL"
  );
}

// ---------------------------------------------------------------------------
// Notify popup
// ---------------------------------------------------------------------------

function notifyStoreUpdated() {
  chrome.runtime.sendMessage({ action: "STORE_UPDATED" }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((request: RuntimeMessage, _sender, sendResponse) => {
  hydration
    .then(() => {
      // handleRuntimeMessage pode devolver um valor síncrono OU uma Promise (ex.:
      // RUN_ACTIVE_FETCH dispara o scheduler assíncrono). Normaliza com Promise.resolve
      // para responder ao popup só com o status já resolvido.
      return Promise.resolve(
        handleRuntimeMessage(store, request, {
          log: console.log,
          persistHandle: (handle) => chrome.storage.local.set({ trackedHandle: handle }),
        }),
      ).then((response) => {
        const sessionPersist = shouldPersistSession(request) ? persistSession() : Promise.resolve();
        const localPersist = shouldPersistLocal(request) ? persistLocal() : Promise.resolve();

        return Promise.all([sessionPersist, localPersist]).then(() => {
          if (shouldPersistSession(request)) notifyStoreUpdated();
          sendResponse(response);
        });
      });
    })
    .catch((error) => {
      console.error("[He4rt Analytics] falha ao processar mensagem", error);
      sendResponse({ error: String(error) });
    });
  return true;
});
