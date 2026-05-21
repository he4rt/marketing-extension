import type { RuntimeMessage } from "../shared/messages";
import { createStore, handleRuntimeMessage } from "./controller";

const store = createStore();

chrome.storage.local.get(["trackedHandle"], (result) => {
  if (typeof result.trackedHandle === "string") store.trackedHandle = result.trackedHandle;
});

chrome.runtime.onMessage.addListener((request: RuntimeMessage, _sender, sendResponse) => {
  const response = handleRuntimeMessage(store, request, {
    log: console.log,
    persistHandle: (handle) => chrome.storage.local.set({ trackedHandle: handle }),
  });
  sendResponse(response);
  return true;
});
