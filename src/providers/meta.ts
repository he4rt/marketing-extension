import type { SocialProvider } from "../shared/domain";

// Metadados leves de cada provider, compartilhados por TODOS os contextos de execução
// (manifest, interceptor MAIN, content ISOLATED, popup). É a única fonte de verdade para
// hosts, abas e identidade visual — adicionar um provider começa aqui.

export type ProviderMeta = {
  id: SocialProvider;
  name: string;
  color: string;
  popupPrefix: string; // prefixo dos ids no popup (x, ig, li, dt)
  hosts: string[]; // domínios base para casamento em runtime
  matches: string[]; // padrões chrome para content_scripts (vazio = Background-only)
  // Hosts adicionais que o provider precisa permissão para CHAMAR (fetch ativo),
  // separados de `matches` para o split do ADR-0003 (Active Fetch). O manifest une os dois
  // em `host_permissions`; ausente = só os `matches` valem como permissão de host.
  hostPermissions?: string[];
};

export const PROVIDER_METAS: ProviderMeta[] = [
  {
    id: "x",
    name: "X",
    color: "#1d9bf0",
    popupPrefix: "x",
    hosts: ["x.com", "twitter.com"],
    matches: ["https://x.com/*", "https://twitter.com/*"],
    hostPermissions: ["https://x.com/*", "https://twitter.com/*"],
  },
  {
    id: "instagram",
    name: "Instagram",
    color: "#ff7ac8",
    popupPrefix: "ig",
    hosts: ["instagram.com"],
    matches: ["https://www.instagram.com/*"],
    hostPermissions: ["https://www.instagram.com/*"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    popupPrefix: "li",
    hosts: ["linkedin.com"],
    matches: ["https://www.linkedin.com/*"],
    // Active Fetch (L3) replica chamadas Voyager para www.linkedin.com — precisa da
    // permissão de host explícita além dos matches de content script.
    hostPermissions: ["https://www.linkedin.com/*"],
  },
  {
    id: "devto",
    name: "dev.to",
    color: "#3b49df",
    popupPrefix: "dt",
    hosts: ["dev.to"],
    matches: [],
    hostPermissions: ["https://dev.to/*"],
  },
];

export function providerForHost(hostname: string): SocialProvider | null {
  const host = (hostname || "").toLowerCase();
  for (const meta of PROVIDER_METAS) {
    if (meta.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return meta.id;
  }
  return null;
}

export function metaFor(id: SocialProvider): ProviderMeta | undefined {
  return PROVIDER_METAS.find((meta) => meta.id === id);
}
