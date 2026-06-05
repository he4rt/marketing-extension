import type { SocialMetrics } from "../../../../shared/domain";
import type { FlightTables } from "./flight-parser";

export function emptyMetrics(): SocialMetrics {
  return {
    bookmark_count: 0,
    comment_count: 0,
    like_count: 0,
    quote_count: 0,
    reply_count: 0,
    repost_count: 0,
    retweet_count: 0,
    save_count: 0,
    view_count: 0,
  };
}

// Tipos de reação que somam para o like_count agregado.
const REACTION_TYPES = ["LIKE", "APPRECIATION", "INTEREST", "EMPATHY", "PRAISE", "ENTERTAINMENT"];

// Contadores inline do stream Flight. Cada par é um id tipado + intValue, no shape
// `{"key":{"value":{"$case":"id","id":"<id>"}}},"value":{"$case":"intValue","intValue":N}`.
// O <id> carrega a URN numérica do post. (O fixture sintético tinha um `key.key` extra
// que NÃO existe no stream real — por isso o leitor antigo zerava tudo.)
const REACTION =
  /"id":"ReactionType_([A-Z]+)_urn:li:activity:(\d+)"\}\}\},"value":\{"\$case":"intValue","intValue":(\d+)\}/g;
const COMMENT =
  /"id":"commentCount-urn:li:activity:(\d+)"\}\}\},"value":\{"\$case":"intValue","intValue":(\d+)\}/g;
const REPOST =
  /"id":"repostCount-urn:li:activity:(\d+)"\}\}\},"value":\{"\$case":"intValue","intValue":(\d+)\}/g;

// Aplica os matches de uma regex à acumulação por-tipo/contador, filtrando pela URN do
// post. Dedup por MAX: o mesmo contador renderiza em vários lugares do stream; somar
// todas as ocorrências inflaria — pegamos o maior valor visto por chave.
function maxByKey(target: Map<string, number>, raw: string, re: RegExp, id: string): void {
  re.lastIndex = 0;
  let m = re.exec(raw);
  while (m !== null) {
    const hasType = m.length === 4;
    const urn = hasType ? m[2] : m[1];
    if (urn === id) {
      const key = hasType ? (m[1] as string) : "count";
      const value = Number(hasType ? m[3] : m[2]);
      if (Number.isFinite(value)) target.set(key, Math.max(target.get(key) ?? 0, value));
    }
    m = re.exec(raw);
  }
}

// Detalhamento de reações POR TIPO da `activityUrn` (LIKE/PRAISE/EMPATHY/…), dedup por
// MAX. É a riqueza que o export expõe em reaction_breakdown (invariante #3). Só tipos
// conhecidos e com valor > 0 entram. Defensivo: sem contadores → {}. Nunca lança.
export function reactionBreakdown(
  activityUrn: string,
  tables: FlightTables,
): Record<string, number> {
  const id = activityUrn.split(":").pop() ?? activityUrn;
  const reactions = new Map<string, number>();
  for (const raw of tables.byId.values()) {
    if (!raw.includes(id)) continue;
    maxByKey(reactions, raw, REACTION, id);
  }
  const breakdown: Record<string, number> = {};
  for (const [type, value] of reactions) {
    if (REACTION_TYPES.includes(type) && value > 0) breakdown[type] = value;
  }
  return breakdown;
}

// Lê os contadores inline e soma só os que casam a `activityUrn` do post. like_count é a
// soma do reactionBreakdown (mesma fonte). Defensivo: ausência de contadores → zeradas.
export function readContadores(activityUrn: string, tables: FlightTables): SocialMetrics {
  const id = activityUrn.split(":").pop() ?? activityUrn;
  const metrics = emptyMetrics();
  const breakdown = reactionBreakdown(activityUrn, tables);
  metrics.like_count = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  const comments = new Map<string, number>();
  const reposts = new Map<string, number>();
  for (const raw of tables.byId.values()) {
    if (!raw.includes(id)) continue;
    maxByKey(comments, raw, COMMENT, id);
    maxByKey(reposts, raw, REPOST, id);
  }
  metrics.comment_count = comments.get("count") ?? 0;
  metrics.reply_count = metrics.comment_count;
  metrics.repost_count = reposts.get("count") ?? 0;
  return metrics;
}
