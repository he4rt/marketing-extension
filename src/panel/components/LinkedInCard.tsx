// Card de post do LinkedIn. Usa o shape REAL do GET_PLATFORM_DATA: engagers são contadores
// {captured,total} (NÃO arrays — isso vinha quebrando o detalhe). Ações explícitas no rodapé
// (Detalhes / Abrir ↗) para facilitar a navegação. reaction_breakdown vem de metrics.

import { engagerSummary } from "../features/linkedin-discovery/engagers";
import { fmt, formatDate } from "../lib/format";
import { type LinkedInPanelPost, openDetail } from "../state/store";
import { IconBtn } from "./IconBtn";

export function LinkedInCard({ post }: { post: LinkedInPanelPost }) {
  const author = post.author.name || post.author.vanity_name || "Visível";
  const date = post.created_at ? formatDate(post.created_at) : post.timestamp_text || "";
  const breakdown = Object.entries(post.metrics.reaction_breakdown || {})
    .filter(([, n]) => n > 0)
    .slice(0, 5);

  return (
    <article class="mt-2.5 rounded-xl border border-line bg-card p-3.5 shadow-sm">
      <div class="mb-2 flex items-center gap-1.5">
        <span class="rounded bg-[#e5eefa] px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-li">
          {post.type === "repost" ? "repost" : "original"}
        </span>
        <time class="ml-auto font-mono text-[10px] text-ink-3">{date}</time>
      </div>
      <div class="mb-1 text-[11px] text-ink-3">{author}</div>
      <div class="mb-2.5 line-clamp-2 text-[13px] leading-snug text-ink">
        {post.text || "(sem texto)"}
      </div>
      <div class="flex flex-wrap gap-3.5 text-[11px] text-ink-3">
        <span>
          <b class="font-mono font-semibold text-ink">{fmt(post.metrics.like_count)}</b> curtidas
        </span>
        <span>
          <b class="font-mono font-semibold text-ink">{fmt(post.metrics.comment_count)}</b> coment.
        </span>
        <span>
          <b class="font-mono font-semibold text-ink">{fmt(post.metrics.share_count)}</b> compart.
        </span>
        <span>
          <b class="font-mono font-semibold text-ink">{engagerSummary(post.engagers.reactions)}</b>{" "}
          actors
        </span>
      </div>
      {breakdown.length > 0 && (
        <div class="mt-2.5 flex flex-wrap gap-3 border-t border-dashed border-line pt-2.5 font-mono text-[10px] text-ink-3">
          {breakdown.map(([kind, n]) => (
            <span key={kind}>
              {kind.toLowerCase()} {n}
            </span>
          ))}
        </div>
      )}
      <div class="mt-2.5 flex gap-2 border-t border-line pt-2.5">
        <IconBtn onClick={() => openDetail("linkedin", post.id)}>Detalhes</IconBtn>
        <IconBtn
          onClick={() =>
            chrome.tabs.create({
              url: `https://www.linkedin.com/feed/update/${post.activity_urn}/`,
            })
          }
        >
          Abrir ↗
        </IconBtn>
      </div>
    </article>
  );
}
