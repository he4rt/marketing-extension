// Shell do painel: compõe Header + Collection Target + Tabs + conteúdo da aba ativa.
// O conteúdo reage aos signals (activeTab/providerData/summary) — re-render incremental.

import type { SocialProvider } from "../shared/domain";
import { sortPublications } from "../shared/sort";
import { CollectionTarget } from "./components/CollectionTarget";
import { ConfigPanel } from "./components/ConfigPanel";
import { DetailView } from "./components/detail/DetailView";
import { Header } from "./components/Header";
import { LinkedInCard } from "./components/LinkedInCard";
import { PublicationCard } from "./components/PublicationCard";
import { Spinner } from "./components/Spinner";
import { SummaryCards } from "./components/SummaryCards";
import { Tabs } from "./components/Tabs";
import { CountInfo, Toolbar } from "./components/Toolbar";
import { DeepenControl } from "./features/active-fetch/DeepenControl";
import { unreadableLabel } from "./features/linkedin-discovery/labels";
import { plural } from "./lib/format";
import {
  activeTab,
  type LinkedInProviderData,
  loading,
  type ProviderData,
  providerData,
  selected,
} from "./state/store";

const EMPTY_HINT: Record<string, string> = {
  x: "Defina um perfil na aba Config, abra X.com e navegue pelas publicações.",
  instagram: "Defina um perfil na aba Config, abra Instagram e navegue pelas publicações.",
  linkedin: "Defina um perfil na aba Config, abra LinkedIn e navegue pelo feed.",
};

function EmptyState({ provider }: { provider: SocialProvider }) {
  return (
    <div class="px-5 py-8 text-center">
      <p class="text-sm text-ink-3">Nenhum dado capturado.</p>
      <p class="mt-2 text-xs leading-relaxed text-ink-3">{EMPTY_HINT[provider]}</p>
    </div>
  );
}

function PlatformTab({ provider }: { provider: SocialProvider }) {
  const data = providerData.value[provider] as ProviderData | undefined;
  const pubs = data?.publications ? sortPublications(Object.values(data.publications)) : [];
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Toolbar
        provider={provider}
        disabled={pubs.length === 0}
        info={<CountInfo n={pubs.length} noun={plural(pubs.length, "publicação", "publicações")} />}
      />
      {pubs.length === 0 ? (
        loading.value ? (
          <Spinner />
        ) : (
          <EmptyState provider={provider} />
        )
      ) : (
        <div class="flex-1 overflow-y-auto px-3.5 pb-4">
          {pubs.map((p) => (
            <PublicationCard key={p.publication_id} pub={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkedInTab() {
  const data = providerData.value.linkedin as LinkedInProviderData | undefined;
  const posts = data?.content ?? [];
  const sub = unreadableLabel(data?.unreadable);
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Toolbar
        provider="linkedin"
        disabled={posts.length === 0}
        info={
          <CountInfo
            n={posts.length}
            noun={plural(posts.length, "post descoberto", "posts descobertos")}
            sub={sub || undefined}
          />
        }
      />
      {posts.length > 0 && <DeepenControl calibrated={data?.calibrated === true} />}
      {posts.length === 0 ? (
        loading.value ? (
          <Spinner />
        ) : (
          <EmptyState provider="linkedin" />
        )
      ) : (
        <div class="mt-2 flex-1 overflow-y-auto px-3.5 pb-4">
          {posts.map((p) => (
            <LinkedInCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabContent() {
  const tab = activeTab.value;
  if (tab === "all") return <SummaryCards />;
  if (tab === "config") return <ConfigPanel />;
  if (tab === "linkedin") return <LinkedInTab />;
  return <PlatformTab provider={tab} />;
}

export function App() {
  return (
    <div class="flex h-full flex-col bg-surface">
      <Header />
      <CollectionTarget />
      <Tabs />
      <div class="mx-3.5 h-px bg-line" />
      {selected.value ? <DetailView /> : <TabContent />}
    </div>
  );
}
