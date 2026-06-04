import { PROVIDER_METAS } from "./providers/meta";

// Os matches dos content scripts saem do registry de providers.
const matches = PROVIDER_METAS.flatMap((meta) => meta.matches);

// host_permissions = união (deduplicada) dos matches com os hostPermissions extras dos
// providers (split do ADR-0003: alguns providers chamam endpoints via Active Fetch e
// precisam da permissão de host além de onde injetam content script).
const hostPermissions = [
  ...new Set([...matches, ...PROVIDER_METAS.flatMap((meta) => meta.hostPermissions ?? [])]),
];

const manifest = {
  manifest_version: 3,
  name: "He4rt Analytics",
  version: "1.0.0",
  description: "Captura engajamento social da comunidade He4rt Developers",
  permissions: ["storage", "tabs", "unlimitedStorage"],
  host_permissions: hostPermissions,
  background: {
    service_worker: "background.js",
    type: "module",
  },
  content_scripts: [
    {
      matches,
      js: ["interceptor.js"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches,
      js: ["content.js"],
      run_at: "document_start",
      world: "ISOLATED",
    },
  ],
  action: {
    default_popup: "popup.html",
    default_title: "He4rt Analytics",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
} satisfies chrome.runtime.ManifestV3;

export default manifest;
