// Detalhe de uma publicação X/Instagram: texto completo + métricas + comentários +
// engajadores. Recebe os dados já resolvidos por props (puro, sem store/signals).
// Renderiza só o CORPO — o <DetailShell> ao redor provê "← voltar" e o scroll.
// JSX escapa o texto automaticamente — sem necessidade de montar HTML.

import type {
  SocialActor,
  SocialComment,
  SocialEngagement,
  SocialPublication,
} from "../../../shared/domain";
import { fmt, formatDate } from "../../lib/format";

// Identidade legível de um actor: @username quando houver, senão o nome.
function actorLabel(actor: SocialActor): string {
  return actor.username ? `@${actor.username}` : actor.name || "(desconhecido)";
}

// Rótulo de seção compartilhado (Comentários / Engajadores).
function SectionLabel({ children }: { children: string }) {
  return (
    <h4 class="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
      {children}
    </h4>
  );
}

// Uma métrica isolada da linha de números (valor em font-mono + rótulo suave).
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <b class="font-mono font-semibold text-ink">{fmt(value)}</b> {label}
    </span>
  );
}

function CommentRow({ comment }: { comment: SocialComment }) {
  const when =
    comment.relative_created_at || (comment.created_at ? formatDate(comment.created_at) : "");
  return (
    <li class="border-t border-line py-2 first:border-t-0">
      <div class="mb-0.5 flex items-baseline gap-2 text-[11px] text-ink-3">
        <span>{actorLabel(comment.author)}</span>
        <span class="ml-auto font-mono">{fmt(comment.like_count)} ♥</span>
        {when ? <span class="font-mono">{when}</span> : null}
      </div>
      <div class="text-[13px] text-ink">{comment.text || "(sem texto)"}</div>
    </li>
  );
}

function EngagementRow({ engagement }: { engagement: SocialEngagement }) {
  const badge = engagement.kind === "like" ? "curtiu" : "comentou";
  return (
    <li class="flex items-center gap-2 border-t border-line py-2 text-[11px] text-ink-3 first:border-t-0">
      <span class="text-[13px] text-ink">{actorLabel(engagement.actor)}</span>
      <span class="ml-auto rounded bg-surface px-1.5 py-px font-mono text-[9px] uppercase text-ink-2">
        {badge}
      </span>
    </li>
  );
}

export function PublicationDetail({
  pub,
  comments,
  engagements,
}: {
  pub: SocialPublication;
  comments: SocialComment[];
  engagements: SocialEngagement[];
}) {
  const author = pub.author.username ? `@${pub.author.username}` : pub.author.name;
  const openOnNetwork = () => {
    if (pub.url) chrome.tabs.create({ url: pub.url });
  };

  return (
    <div>
      {/* Cabeçalho: autor, data e atalho para abrir na rede de origem. */}
      <div class="flex items-start gap-2">
        <div class="min-w-0">
          <div class="text-[13px] text-ink">{author}</div>
          {pub.created_at ? (
            <time class="font-mono text-[10px] text-ink-3">{formatDate(pub.created_at)}</time>
          ) : null}
        </div>
        {pub.url ? (
          <button
            type="button"
            onClick={openOnNetwork}
            class="ml-auto shrink-0 rounded-lg border border-line-2 px-2.5 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            abrir na rede ↗
          </button>
        ) : null}
      </div>

      {/* Texto completo — sem line-clamp, este é o detalhe. */}
      <div class="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
        {pub.text || "(sem legenda)"}
      </div>

      {/* Linha de métricas consolidadas. */}
      <div class="mt-3 flex flex-wrap gap-3.5 border-t border-line pt-3 text-[11px] text-ink-3">
        <Metric value={pub.metrics.like_count} label="curtidas" />
        <Metric value={pub.metrics.comment_count} label="coment." />
        <Metric value={pub.metrics.repost_count} label="reposts" />
        <Metric value={pub.metrics.view_count} label="views" />
      </div>

      {/* Comentários. NOTA: o Instagram web serve comments[] via REST (não GraphQL); o
          parser atual só lê o shape GraphQL, então aqui pode vir vazio mesmo com a
          publicação tendo comentários na rede. */}
      <SectionLabel>{`Comentários (${comments.length})`}</SectionLabel>
      {comments.length > 0 ? (
        <ul>
          {comments.map((c) => (
            <CommentRow key={c.comment_id} comment={c} />
          ))}
        </ul>
      ) : (
        <p class="text-[12px] text-ink-3">Nenhum comentário capturado.</p>
      )}

      {/* Engajadores (curtidas/comentários por actor). */}
      <SectionLabel>{`Engajadores (${engagements.length})`}</SectionLabel>
      {engagements.length > 0 ? (
        <ul>
          {engagements.map((e) => (
            <EngagementRow key={e.engagement_id} engagement={e} />
          ))}
        </ul>
      ) : (
        <p class="text-[12px] text-ink-3">Nenhum engajador capturado.</p>
      )}
    </div>
  );
}
