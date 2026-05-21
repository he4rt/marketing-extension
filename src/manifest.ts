const manifest = {
  manifest_version: 3,
  name: "He4rt Analytics",
  version: "1.0.0",
  description: "Track community engagement on X/Twitter for He4rt Developers",
  permissions: ["storage"],
  host_permissions: ["https://x.com/*", "https://twitter.com/*"],
  background: {
    service_worker: "background.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://x.com/*", "https://twitter.com/*"],
      js: ["interceptor.js"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: ["https://x.com/*", "https://twitter.com/*"],
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
