// Card de post do LinkedIn (ExportLinkedInPost). Preserva a riqueza do reaction_breakdown
// — a regra de ouro do projeto manda não perdê-la. Abre o update no LinkedIn ao clicar.

import type { ExportLinkedInPost } from "../../shared/domain";
import { fmt, formatDate } from "../lib/format";
import { openDetail } from "../state/store";

export function LinkedInCard({ post }: { post: ExportLinkedInPost }) {
  const open = () => openDetail("linkedin", post.id);

  const author = post.author.name || post.author.vanity_name || "Visível";
  const date = post.created_at ? formatDate(post.created_at) : post.timestamp_text || "";
  const capturedActors = post.engagers?.reactions?.length ?? 0;
  const breakdown = Object.entries(post.metrics.reaction_breakdown || {})
    .filter(([, n]) => n > 0)
    .slice(0, 5);

  return (
    <button
      type="button"
      onClick={open}
      class="mt-2.5 block w-full rounded-xl border border-line bg-card p-3.5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:border-line-2"
    >
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
          <b class="font-mono font-semibold text-ink">{fmt(capturedActors)}</b> actors capt.
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
    </button>
  );
}
