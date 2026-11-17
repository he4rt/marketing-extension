// Derivação de um LinkedInPostData a partir de uma SocialPublication da busca SDUI.
//
// Extraído de process.ts (regra 150 linhas) para acomodar a classificação member/org
// e o ugcPost INLINE. PURO: sem chrome.*, sem estado.
//
// O post aparece no export v3 pelo MESMO caminho do feed (buildPlatformDataLinkedin itera
// lstore.feedOrder + lstore.posts). id = activity_urn; métricas espelhadas da SocialMetrics.
//
// ADITIVO E GATED (invariante golden-master): por padrão o comportamento é idêntico ao
// anterior. As únicas saídas novas dependem do NÓ CRU do post:
//   - org: author.author_type/company_urn + vanity/urn REAIS (corrige o slug fabricado);
//   - member: comportamento INALTERADO (não emite author_type/company_urn);
//   - share_urn: populado só quando o nó contém postThreadUrn (ugcPost INLINE), senão "".
// Fixtures antigas não têm NAV /company/ nem postThreadUrn → membros e snapshots intactos.

import type { LinkedInPostData, SocialPublication } from "../../../../shared/domain";
import { classifyAuthorNav } from "../../shared/author-kind";
import { extractUgcPost } from "../../shared/thread-urn";

export function publicationToPostData(
  pub: SocialPublication,
  breakdown: Record<string, number> = {},
  rawNode = "",
): LinkedInPostData {
  const author: LinkedInPostData["author"] = {
    urn: pub.author.provider_user_id,
    name: pub.author.name,
    headline: pub.author.full_name ?? "",
    avatar_url: pub.author.avatar_url ?? "",
    vanity_name: pub.author.username,
  };

  // Classificação member/org pelo NAV do autor (escopado ao nó deste post — anti-hijack).
  const kind = classifyAuthorNav(rawNode);
  if (kind?.kind === "organization") {
    // Org: corrige o vanity/urn fabricado a partir do nome de exibição para o REAL do NAV.
    author.vanity_name = kind.vanity;
    author.urn = kind.vanity;
    author.author_type = "organization";
    author.company_urn = `urn:li:fsd_company:${kind.vanity}`;
  }
  // Membro: comportamento INALTERADO (não emite author_type/company_urn) → bytes idênticos.

  // ugcPost INLINE → share_urn (necessário ao Active Fetch). GATED: só populamos quando o
  // nó realmente expõe o ugcPost; fixtures antigas não têm → share_urn fica "" (snapshot).
  const ugcId = extractUgcPost(rawNode);
  const shareUrn = ugcId ? `urn:li:ugcPost:${ugcId}` : "";

  return {
    id: pub.publication_id,
    activity_urn: pub.publication_id,
    share_urn: shareUrn,
    text: pub.text,
    type: "original",
    author,
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
