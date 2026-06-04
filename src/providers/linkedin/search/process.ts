import { recordProvenance, storePublication } from "../../../background/store";
import type {
  BackgroundStore,
  LinkedInPostData,
  SocialMetrics,
  SocialPublication,
} from "../../../shared/domain";
import type { CapturedPayloadMessage } from "../../../shared/messages";
import { publicationKey } from "../../shared/utils";
import { parseLinkedInSearchSdui } from "./sdui";

// Endpoint lógico da captura SDUI da busca (declarado em capture.ts via
// responseFormat:"text"). O `payload` chega como STRING (stream React-Flight).
export const SEARCH_ENDPOINT = "searchResultsContent";

// Lê a query ativa (`?keywords=`) da URL da SRP. Sem pageUrl ou sem keywords → "".
// Defensivo: URL malformada nunca derruba o processCapture.
function activeQuery(pageUrl?: string): string {
  if (!pageUrl) return "";
  try {
    return new URL(pageUrl).searchParams.get("keywords") ?? "";
  } catch {
    return "";
  }
}

// Deriva um LinkedInPostData mínimo de uma SocialPublication da busca, para que o
// post apareça no export v3 pelo MESMO caminho do feed (buildPlatformDataLinkedin
// itera lstore.feedOrder + lstore.posts). id = activity_urn; share_urn vazio
// (a busca não expõe o share urn); métricas espelhadas da SocialMetrics.
export function publicationToPostData(
  pub: SocialPublication,
  breakdown: Record<string, number> = {},
): LinkedInPostData {
  return {
    id: pub.publication_id,
    activity_urn: pub.publication_id,
    share_urn: "",
    text: pub.text,
    type: "original",
    author: {
      urn: pub.author.provider_user_id,
      name: pub.author.name,
      headline: pub.author.full_name ?? "",
      avatar_url: pub.author.avatar_url ?? "",
      vanity_name: pub.author.username,
    },
    metrics: {
      like_count: pub.metrics.like_count,
      comment_count: pub.metrics.comment_count,
      share_count: pub.metrics.repost_count,
      total_reactions: pub.metrics.like_count,
      reaction_breakdown: breakdown,
    },
    hashtags: pub.hashtags,
    media: [],
    created_at: pub.created_at,
    timestamp_text: "",
    source: pub.source ?? "search_sdui",
  };
}

function metricTotal(m: SocialMetrics): number {
  return m.like_count + m.comment_count + m.repost_count;
}

// Merge de métricas entre capturas (#14 — streams rsc-action preguiçosos). O render
// inicial da busca traz os posts SEM contadores; pagination/component os trazem COM.
// Como `storePublication` faz `{...existing, ...novo}`, uma captura sem métricas
// SOBRESCREVERIA uma anterior com engajamento → aqui, se a nova vem zerada e já existe
// uma com engajamento, preserva a existente (nunca rebaixa para zero).
function preserveMetrics(store: BackgroundStore, pub: SocialPublication): void {
  const existing =
    store.platforms.linkedin.publications[publicationKey("linkedin", pub.publication_id)];
  if (existing && metricTotal(pub.metrics) === 0 && metricTotal(existing.metrics) > 0) {
    pub.metrics = existing.metrics;
  }
}

// Processa a captura `searchResultsContent` (#14): parseia o stream SDUI, consolida
// as publications no store per-platform (storePublication), espelha cada post em
// lstore.posts/feedOrder (para o export) e carimba a Provenance {mode:"search", value:<query>}.
export function processLinkedInSearchCapture(
  store: BackgroundStore,
  request: CapturedPayloadMessage,
) {
  const lstore = store.platforms.linkedin.extra;
  const query = activeQuery(request.pageUrl);

  const { publications, unreadable, breakdowns } = parseLinkedInSearchSdui(
    String(request.payload),
  );

  // Acumula os nós em drift (#18). O parser é defensivo e nunca lança; o contador de
  // ilegíveis é o sinal de saúde do shape SDUI exibido no popup. Soma entre capturas
  // (paginação/refresh da busca trazem novos lotes), por isso é aditivo no store.
  if (unreadable > 0) {
    lstore.searchUnreadable = (lstore.searchUnreadable ?? 0) + unreadable;
  }

  for (const pub of publications) {
    const previous = lstore.posts[pub.publication_id];
    preserveMetrics(store, pub);
    storePublication(store, pub);

    let breakdown = breakdowns[pub.publication_id] ?? {};
    // Não rebaixa o reaction_breakdown: se esta captura veio sem reações mas já havia
    // detalhamento (de um stream rsc-action anterior), preserva — par do preserveMetrics.
    if (Object.keys(breakdown).length === 0 && previous?.metrics.reaction_breakdown) {
      breakdown = previous.metrics.reaction_breakdown;
    }

    const post = publicationToPostData(pub, breakdown);
    lstore.posts[post.id] = post;
    if (!lstore.feedOrder.includes(post.id)) lstore.feedOrder.push(post.id);

    if (query) recordProvenance(store, "linkedin", pub.publication_id, "search", query);
  }

  logSearchDiagnostics(query, publications, unreadable);
}

// Diagnóstico por-captura da busca SDUI (no console do service worker). Além de
// descobertos/ilegíveis, reporta a SAÚDE DAS MÉTRICAS — quantos posts vieram com algum
// engajamento (>0). "0/N com métricas" é o sinal claro de que os contadores de reação
// não foram extraídos daquele stream (o alvo da investigação de metrics=0).
function logSearchDiagnostics(
  query: string,
  publications: SocialPublication[],
  unreadable: number,
): void {
  const withMetrics = publications.filter(
    (p) => p.metrics.like_count + p.metrics.comment_count + p.metrics.repost_count > 0,
  ).length;
  const escopo = query ? `busca "${query}"` : "busca (sem query)";
  console.info(
    `[He4rt Analytics] ${escopo} · ${publications.length} descobertos · ` +
      `${unreadable} ilegíveis · ${withMetrics}/${publications.length} com métricas`,
  );
}
