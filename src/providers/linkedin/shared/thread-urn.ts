// Extração do ugcPost INLINE de um nó de post da busca SDUI. PURO e DEFENSIVO:
// não toca chrome.*, nunca lança.
//
// Achado-chave (captura ao vivo 2026-06-05): o ugcPost vem INLINE no nó do post — NÃO
// é preciso resolver um endpoint. Ele identifica o conteúdo gerado pelo usuário e é a
// chave que o Active Fetch (L3) usa para buscar reações/comentários reais (o activity
// urn dava 200-vazio em posts de organização).
//
// Formas presentes no MESMO nó (em ordem de robustez):
//   1. postThreadUrn → ...userGeneratedContentId":"<id>"  (escapado ou não no flight)
//   2. URL canônica: /posts/<slug>-ugcPost-<id>-<code>
//
// Retorna o id numérico (string) do ugcPost, ou null se nenhuma forma estiver presente.

// Primário: `userGeneratedContentId":"<digits>"` — tolerante a barras de escape do
// stream Flight (\" antes das aspas). Casa tanto escapado quanto cru.
const UGC_CONTENT_ID = /userGeneratedContentId\\?":\\?"?(\d+)/;

// Fallback: o id embutido na URL canônica do post (/posts/...-ugcPost-<id>-).
const UGC_FROM_URL = /\/posts\/[^"]*-ugcPost-(\d+)-/;

export function extractUgcPost(rawNode: string): string | null {
  if (typeof rawNode !== "string" || rawNode.length === 0) return null;

  const primary = UGC_CONTENT_ID.exec(rawNode);
  if (primary?.[1]) return primary[1];

  const fromUrl = UGC_FROM_URL.exec(rawNode);
  if (fromUrl?.[1]) return fromUrl[1];

  return null;
}
