// Detalhe de um post do LinkedIn: cabeçalho + texto + métricas + reaction_breakdown +
// reações/reposts/comentários. Puro: trabalha só a partir da prop `post` (sem store).
// Renderiza só o CORPO — o <DetailShell> ao redor provê "← voltar" e o scroll.

import type { ComponentChildren } from "preact";
import type {
  ExportComment,
  ExportLinkedInPost,
  LinkedInReactionUser,
} from "../../../shared/domain";
import { fmt, formatDate } from "../../lib/format";

const ROW = "border-t border-line py-2 first:border-t-0";
const LABEL = "mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3";
const BADGE = "ml-auto rounded bg-surface px-1.5 py-px font-mono text-[9px] uppercase text-ink-2";
const EMPTY = "text-[12px] text-ink-3";
const OPEN_BTN =
  "ml-auto shrink-0 rounded-lg border border-line-2 px-2.5 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-ink hover:text-ink";
// Largura proporcional da barra de uma reação (n sobre o maior valor do breakdown).
const pct = (n: number, max: number) => `${max > 0 ? (n / max) * 100 : 0}%`;

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <b class="font-mono font-semibold text-ink">{fmt(value)}</b> {label}
    </span>
  );
}

// Seção: título com contagem + lista (ou aviso de vazio).
function Section(props: { label: string; count: number; children: ComponentChildren }) {
  return (
    <>
      <h4 class={LABEL}>{`${props.label} (${props.count})`}</h4>
      {props.count > 0 ? <ul>{props.children}</ul> : <p class={EMPTY}>Nada capturado.</p>}
    </>
  );
}

function CommentRow({ comment }: { comment: ExportComment }) {
  const when = comment.created_at ? formatDate(comment.created_at) : "";
  return (
    <li class={ROW}>
      <div class="mb-0.5 flex items-baseline gap-2 text-[11px] text-ink-3">
        <span>{comment.author?.name || "(desconhecido)"}</span>
        <span class="ml-auto font-mono">{fmt(comment.like_count ?? 0)} ♥</span>
        {when ? <span class="font-mono">{when}</span> : null}
      </div>
      <div class="text-[13px] text-ink">{comment.text || "(sem texto)"}</div>
    </li>
  );
}

function ReactionRow({ user }: { user: LinkedInReactionUser }) {
  return (
    <li class={`flex items-center gap-2 text-[11px] text-ink-3 ${ROW}`}>
      <span class="text-[13px] text-ink">{user.name || "(desconhecido)"}</span>
      <span class={BADGE}>{(user.reaction_type || "react").toLowerCase()}</span>
    </li>
  );
}

export function LinkedInDetail({ post }: { post: ExportLinkedInPost }) {
  const { reactions, reposts, comments } = post.engagers;
  // Reposts sem nome são entradas vazias (ACTOR_COMPONENT) — pule-as na exibição.
  const namedReposts = reposts.filter((r) => Boolean(r.name));
  const date = post.created_at ? formatDate(post.created_at) : post.timestamp_text || "";
  // reaction_breakdown ordenado por contagem desc, com o máximo para escalar as barras.
  const breakdown = Object.entries(post.metrics.reaction_breakdown || {})
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);
  const maxCount = breakdown.reduce((max, [, n]) => (n > max ? n : max), 0);
  const noEngagers = reactions.length === 0 && namedReposts.length === 0 && comments.length === 0;
  const openOnNetwork = () =>
    chrome.tabs.create({ url: `https://www.linkedin.com/feed/update/${post.activity_urn}/` });

  return (
    <div>
      {/* Cabeçalho: autor, headline, data, badge de tipo e botão "abrir na rede". */}
      <div class="flex items-start gap-2">
        <div class="min-w-0">
          <div class="text-[13px] text-ink">{post.author.name || "(autor desconhecido)"}</div>
          {post.author.headline ? (
            <div class="text-[11px] text-ink-3">{post.author.headline}</div>
          ) : null}
          <div class="mt-1 flex items-center gap-1.5">
            <span class="rounded bg-[#e5eefa] px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-li">
              {post.type === "repost" ? "repost" : "original"}
            </span>
            {date ? <time class="font-mono text-[10px] text-ink-3">{date}</time> : null}
          </div>
        </div>
        <button type="button" onClick={openOnNetwork} class={OPEN_BTN}>
          abrir na rede ↗
        </button>
      </div>
      {/* Texto completo — sem line-clamp, este é o detalhe. */}
      <div class="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
        {post.text || "(sem texto)"}
      </div>
      {/* Linha de métricas consolidadas. */}
      <div class="mt-3 flex flex-wrap gap-3.5 border-t border-line pt-3 text-[11px] text-ink-3">
        <Metric value={post.metrics.like_count} label="curtidas" />
        <Metric value={post.metrics.comment_count} label="coment." />
        <Metric value={post.metrics.share_count} label="compart." />
        <Metric value={post.metrics.total_reactions} label="reações" />
      </div>
      {/* reaction_breakdown com barras proporcionais — a riqueza do LinkedIn. */}
      {breakdown.length > 0 ? (
        <Section label="Reaction breakdown" count={breakdown.length}>
          {breakdown.map(([kind, n]) => (
            <li key={kind} class={ROW}>
              <div class="mb-1 flex items-baseline gap-2 text-[11px] text-ink-2">
                <span>{kind.toLowerCase()}</span>
                <span class="ml-auto font-mono text-ink">{fmt(n)}</span>
              </div>
              <span class="block h-1.5 rounded-full bg-li" style={{ width: pct(n, maxCount) }} />
            </li>
          ))}
        </Section>
      ) : null}
      {/* Engajadores: só populam depois do "Aprofundar (L3)" na aba LinkedIn. */}
      {noEngagers ? (
        <p class="mt-4 text-[12px] text-ink-3">
          Rode ‘Aprofundar (L3)’ na aba LinkedIn para coletar reações, reposts e comentários.
        </p>
      ) : (
        <>
          <Section label="Reações" count={reactions.length}>
            {reactions.map((u) => (
              <ReactionRow key={u.urn || u.name} user={u} />
            ))}
          </Section>
          <Section label="Reposts" count={namedReposts.length}>
            {namedReposts.map((r) => (
              <li key={r.urn || r.name} class={`text-[13px] text-ink ${ROW}`}>
                {r.name}
              </li>
            ))}
          </Section>
          <Section label="Comentários" count={comments.length}>
            {comments.map((c) => (
              <CommentRow key={c.comment_id} comment={c} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
