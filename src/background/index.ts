import type { BackgroundStore } from "../shared/domain";
import type { RuntimeMessage } from "../shared/messages";
import { createStore, handleRuntimeMessage } from "./controller";

const CAPTURE_STORE_KEY = "captureStore";
const TRACKED_HANDLE_KEY = "trackedHandle";

const store = createStore();

function mergeStore(target: BackgroundStore, persisted: Partial<BackgroundStore>) {
  Object.assign(target, {
    ...createStore(),
    ...persisted,
    activeProvider: persisted.activeProvider || null,
    archivedEndpoints: persisted.archivedEndpoints || {},
    endpoints: persisted.endpoints || {},
    publications: persisted.publications || {},
    commentsByPublication: persisted.commentsByPublication || {},
    engagementsByPublication: persisted.engagementsByPublication || {},
    instagramPublicationIdsByShortcode: persisted.instagramPublicationIdsByShortcode || {},
    instagramVisiblePublications: persisted.instagramVisiblePublications || [],
    instagramVisibleComments: persisted.instagramVisibleComments || [],
    pageSessionKeys: persisted.pageSessionKeys || {},
    providerPageUrls: persisted.providerPageUrls || {},
    communityReplies: persisted.communityReplies || {},
    trackedHandles: persisted.trackedHandles || {},
    trackedProfiles: persisted.trackedProfiles || {},
    tweets: persisted.tweets || {},
    favoriters: persisted.favoriters || {},
  });
}

const hydration = chrome.storage.local
  .get([CAPTURE_STORE_KEY, TRACKED_HANDLE_KEY])
  .then((result) => {
    if (result[CAPTURE_STORE_KEY] && typeof result[CAPTURE_STORE_KEY] === "object") {
      mergeStore(store, result[CAPTURE_STORE_KEY] as Partial<BackgroundStore>);
    }
    if (typeof result[TRACKED_HANDLE_KEY] === "string") {
      store.trackedHandle = result[TRACKED_HANDLE_KEY];
    }
  });

let persistPromise = Promise.resolve();

function persistStore() {
  const snapshot = JSON.parse(JSON.stringify(store));
  persistPromise = persistPromise
    .then(() =>
      chrome.storage.local.set({
        [TRACKED_HANDLE_KEY]: store.trackedHandle,
        [CAPTURE_STORE_KEY]: snapshot,
      }),
    )
    .catch((error) => console.error("[He4rt Analytics] falha ao persistir estado", error));
  return persistPromise;
}

function shouldPersist(request: RuntimeMessage) {
  return (
    request.action === "CAPTURED_PAYLOAD" ||
    request.action === "GRAPHQL_CAPTURED" ||
    request.action === "SET_HANDLE" ||
    request.action === "SET_ACTIVE_PROVIDER" ||
    request.action === "CLEAR_ALL" ||
    request.action === "PAGE_SESSION_STARTED" ||
    request.action === "VISIBLE_PUBLICATIONS" ||
    request.action === "VISIBLE_COMMENTS"
  );
}

function notifyStoreUpdated() {
  chrome.runtime
    .sendMessage({
      action: "STORE_UPDATED",
      publicationCount: Object.keys(store.publications).length,
      lastUpdated: store.lastUpdated,
    })
    .catch(() => {
      // Normal when the popup is closed.
    });
}

chrome.runtime.onMessage.addListener((request: RuntimeMessage, _sender, sendResponse) => {
  hydration
    .then(() => {
      const response = handleRuntimeMessage(store, request, {
        log: console.log,
        persistHandle: (handle) => chrome.storage.local.set({ [TRACKED_HANDLE_KEY]: handle }),
      });
      const persisted = shouldPersist(request) ? persistStore() : Promise.resolve();
      persisted.then(() => {
        if (
          request.action === "CAPTURED_PAYLOAD" ||
          request.action === "GRAPHQL_CAPTURED" ||
          request.action === "SET_ACTIVE_PROVIDER" ||
          request.action === "PAGE_SESSION_STARTED" ||
          request.action === "VISIBLE_PUBLICATIONS" ||
          request.action === "VISIBLE_COMMENTS"
        ) {
          notifyStoreUpdated();
        }
        sendResponse(response);
      });
    })
    .catch((error) => {
      console.error("[He4rt Analytics] falha ao hidratar estado", error);
      sendResponse({ error: String(error) });
    });
  return true;
});
