// Enumeração dos alvos de aprofundamento (L3) a partir do store.
//
// PURO: lê o store consolidado (sem chrome.*) e devolve os URNs de atividade descobertos
// na busca SDUI. Cada alvo é a identidade lógica + a URN a aprofundar. A faceta Active Fetch
// (MODULE #17) consome isto para o fan-out sequencial.
//
// Shape alinhado ao contrato (impl-contract §2.7): { id, activityUrn }. Quando o seam
// `src/capture/active-fetch.ts` existir, este tipo passa a re-exportar/alinhar com ele.

import type { BackgroundStore } from "../../../shared/domain";

export type ActiveFetchTarget = {
  id: string; // chave estável (ex.: o próprio activity_urn)
  activityUrn: string; // urn:li:activity:...
  // ugcPost INLINE da busca (urn:li:ugcPost:<id>), quando o post o expôs. É a chave que
  // o replay prefere — o activity dava 200-vazio em posts de organização.
  ugcPostUrn?: string;
};

// Enumera os alvos seguindo a ordem do feed (feedOrder). Ignora ids sem post e posts sem
// activity_urn (não há o que aprofundar). Deduplica activity_urn repetidos. Carrega o
// ugcPost (do post.share_urn) quando presente — o endpoints/buildVariables aprofunda por ele.
export function enumerateTargets(store: BackgroundStore): ActiveFetchTarget[] {
  const lstore = store.platforms.linkedin.extra;
  const targets: ActiveFetchTarget[] = [];
  const vistos = new Set<string>();

  for (const id of lstore.feedOrder) {
    const post = lstore.posts[id];
    if (!post) continue;
    const activityUrn = post.activity_urn;
    if (!activityUrn || vistos.has(activityUrn)) continue;
    vistos.add(activityUrn);
    const ugcPostUrn = post.share_urn?.startsWith("urn:li:ugcPost:") ? post.share_urn : undefined;
    targets.push({ id: activityUrn, activityUrn, ugcPostUrn });
  }

  return targets;
}
