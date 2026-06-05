// Detalhe de um post do LinkedIn. IMPORTANTE: o GET_PLATFORM_DATA entrega engagers como
// contadores {captured,total} (as listas de usuários só vão no export v3), então aqui
// mostramos o reaction_breakdown (de metrics) + o status de captura por categoria — não
// listas de nomes. Tratar engagers como array quebrava o render e duplicava o painel.

import { engagerSummary } from "../../features/linkedin-discovery/engagers";
import { fmt, formatDate } from "../../lib/format";
import type { LinkedInPanelPost } from "../../state/store";

const ROW = "border-t border-line py-2 first:border-t-0";
const LABEL = "mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3";
const OPEN_BTN =
  "ml-auto shrink-0 rounded-lg border border-line-2 px-2.5 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-ink hover:text-ink";

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <b class="font-mono font-semibold text-ink">{fmt(value)}</b> {label}
    </span>
  );
}

export function LinkedInDetail({ post }: { post: LinkedInPanelPost }) {
  const { reactions, reposts, comments } = post.engagers;
  const date = post.created_at ? formatDate(post.created_at) : post.timestamp_text || "";
  const breakdown = Object.entries(post.metrics.reaction_breakdown || {})
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);
  const maxCount = breakdown.reduce((max, [, n]) => (n > max ? n : max), 0);
  const noCaptured = reactions.captured === 0 && reposts.captured === 0 && comments.captured === 0;
  const openOnNetwork = () =>
    chrome.tabs.create({ url: `https://www.linkedin.com/feed/update/${post.activity_urn}/` });

  return (
    <div>
      {/* Cabeçalho: autor, headline, badge de tipo, data e atalho pra abrir na rede. */}
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

      {/* Texto completo — sem line-clamp. */}
      <div class="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
        {post.text || "(sem texto)"}
      </div>

      {/* Métricas consolidadas. */}
      <div class="mt-3 flex flex-wrap gap-3.5 border-t border-line pt-3 text-[11px] text-ink-3">
        <Metric value={post.metrics.like_count} label="curtidas" />
        <Metric value={post.metrics.comment_count} label="coment." />
        <Metric value={post.metrics.share_count} label="compart." />
        <Metric value={post.metrics.total_reactions} label="reações" />
      </div>

      {/* reaction_breakdown com barras proporcionais — a riqueza do LinkedIn. */}
      {breakdown.length > 0 ? (
        <>
          <h4 class={LABEL}>Reaction breakdown</h4>
          <ul>
            {breakdown.map(([kind, n]) => (
              <li key={kind} class={ROW}>
                <div class="mb-1 flex items-baseline gap-2 text-[11px] text-ink-2">
                  <span>{kind.toLowerCase()}</span>
                  <span class="ml-auto font-mono text-ink">{fmt(n)}</span>
                </div>
                <span
                  class="block h-1.5 rounded-full bg-li"
                  style={{ width: `${maxCount > 0 ? (n / maxCount) * 100 : 0}%` }}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Status de captura dos engajadores (contadores; as listas só existem no export v3). */}
      <h4 class={LABEL}>Engajadores capturados</h4>
      <ul>
        <li class={`flex justify-between ${ROW}`}>
          <span class="text-[13px] text-ink">Reações</span>
          <span class="font-mono text-[12px] text-ink-2">{engagerSummary(reactions)}</span>
        </li>
        <li class={`flex justify-between ${ROW}`}>
          <span class="text-[13px] text-ink">Reposts</span>
          <span class="font-mono text-[12px] text-ink-2">{engagerSummary(reposts)}</span>
        </li>
        <li class={`flex justify-between ${ROW}`}>
          <span class="text-[13px] text-ink">Comentários</span>
          <span class="font-mono text-[12px] text-ink-2">{engagerSummary(comments)}</span>
        </li>
      </ul>
      {noCaptured ? (
        <p class="mt-3 text-[12px] text-ink-3">
          Rode ‘Aprofundar (L3)’ na aba LinkedIn para coletar reações, reposts e comentários.
        </p>
      ) : null}
    </div>
  );
}
