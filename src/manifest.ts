import { PROVIDER_METAS } from "./providers/meta";

// content_scripts só para providers com matches (não-vazios; Background-only fica de fora).
const contentScriptMatches = PROVIDER_METAS.flatMap((meta) => meta.matches);

// host_permissions = união (deduplicada) dos matches com os hostPermissions extras dos
// providers (split do ADR-0003: alguns providers chamam endpoints via Active Fetch e
// precisam da permissão de host além de onde injetam content script).
const hostPermissions = [
  ...new Set([
    ...contentScriptMatches,
    ...PROVIDER_METAS.flatMap((meta) => meta.hostPermissions ?? []),
  ]),
];

const manifest = {
  manifest_version: 3,
  name: "He4rt Analytics",
  version: "1.0.0",
  description: "Captura engajamento social da comunidade He4rt Developers",
  // "cookies": o SW lê o JSESSIONID (csrf) de linkedin.com para o replay credenciado do L3.
  // "sidePanel": a UI vive num side panel (substitui o popup) — clique no ícone abre o painel.
  permissions: ["storage", "tabs", "unlimitedStorage", "cookies", "sidePanel"],
  host_permissions: hostPermissions,
  background: {
    service_worker: "background.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: contentScriptMatches,
      js: ["interceptor.js"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: contentScriptMatches,
      js: ["content.js"],
      run_at: "document_start",
      world: "ISOLATED",
    },
  ],
  // Sem default_popup: o clique no ícone abre o side panel (ver setPanelBehavior no SW).
  action: {
    default_title: "He4rt Analytics",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
  },
  side_panel: {
    default_path: "panel.html",
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
} satisfies chrome.runtime.ManifestV3;

export default manifest;
