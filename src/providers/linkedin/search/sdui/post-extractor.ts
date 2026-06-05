import type { SocialActor, SocialPublication } from "../../../../shared/domain";
import type { FlightTables } from "./flight-parser";
import { readContadores } from "./metrics-reader";
import { extractText } from "./text-collector";

// Um candidato a post localizado no stream Flight: a URN da atividade + a linha crua
// (JSON Flight) do CABEÇALHO do post (`feed-actor`), onde vivem o nome do autor
// ("for post by <nome>"), o vanity (/in/<vanity>) e a ref do texto (commentary_text).
export type PostNode = {
  activityUrn: string; // ex.: "urn:li:activity:7466899297645649920"
  rawObject: string; // a linha crua do cabeçalho do post (contém feed-actor)
};

// Âncora estável do cabeçalho de um post na SRP: o componente `feed-actor` aparece
// uma vez por post renderizado. NÃO usamos `reactionState` (vinha do fixture sintético;
// no stream real ele se repete centenas de vezes e não casa 1-pra-1 com o post).
const ACTOR_ANCHOR = "feed-actor";

// URN da atividade do post (no cabeçalho há exatamente uma URN única — a do próprio post).
const ACTIVITY = /urn:li:activity:\d+/;

// Nome do autor: o a11y do menu "...for post by <Nome>" é inline e único por cabeçalho.
// É o sinal mais robusto do nome de exibição real (o `memberFirstName` do stream é o
// VISITANTE logado, não o autor do post — não usar como autor).
const AUTHOR_NAME = /for post by ([^"]+?)"/;

// Vanity do autor a partir do link de perfil do cabeçalho (/in/<vanity>).
const VANITY = /\/in\/([A-Za-z0-9\-%]+)/;

// Localiza os nós de post: cada linha que carrega um `feed-actor` e uma URN de atividade
// é um cabeçalho de post. A URN é a do próprio post (única no cabeçalho).
export function findPostNodes(tables: FlightTables): PostNode[] {
  const nodes: PostNode[] = [];
  for (const raw of tables.byId.values()) {
    if (!raw.includes(ACTOR_ANCHOR)) continue;
    const m = ACTIVITY.exec(raw);
    if (m) nodes.push({ activityUrn: m[0], rawObject: raw });
  }
  return nodes;
}

// Monta o SocialActor do cabeçalho. name = display name real ("for post by ..."); o
// vanity vira username/provider_user_id (identidade estável). full_name (headline) não
// é exposto inline de forma confiável no SDUI da busca → omitido na descoberta (L1).
function buildAuthor(rawObject: string, activityUrn: string, name: string): SocialActor {
  const vanity = VANITY.exec(rawObject)?.[1] ?? "";
  const username = vanity || name.toLowerCase().replace(/\s+/g, "_");
  return {
    provider: "linkedin",
    provider_user_id: username || activityUrn,
    username,
    name,
    avatar_url: "",
  };
}

// Extrai UMA SocialPublication de um nó de cabeçalho. Resolve autor (inline), texto
// (via ref commentary_text) e métricas (contadores inline somados pela URN). Retorna
// null se o cabeçalho não expõe o nome do autor — o chamador conta como `unreadable`.
export function extractPublication(node: PostNode, tables: FlightTables): SocialPublication | null {
  const name = AUTHOR_NAME.exec(node.rawObject)?.[1]?.trim();
  if (!name) return null; // cabeçalho sem nome de autor → shape em drift

  return {
    provider: "linkedin",
    publication_id: node.activityUrn,
    type: "original",
    author: buildAuthor(node.rawObject, node.activityUrn, name),
    metrics: readContadores(node.activityUrn, tables),
    text: extractText(node.rawObject, tables),
    created_at: "",
    hashtags: [],
    media_count: 0,
    url: `https://www.linkedin.com/feed/update/${node.activityUrn}`,
    urls: [],
    user_mentions: [],
    source: "search_sdui",
  };
}
