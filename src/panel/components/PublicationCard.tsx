// Card de publicação X/Instagram a partir de SocialPublication. É um <button> (acessível
// por teclado) que abre a publicação. JSX escapa o texto — sem necessidade de escapeHtml.

import type { SocialPublication } from "../../shared/domain";
import { fmt, formatDate, labelType } from "../lib/format";

// Cor do badge por tipo (paleta suave alinhada à rede). Estáticas para o Tailwind detectar.
const TYPE_CLASS: Record<string, string> = {
  original: "bg-[#e7f1fb] text-x",
  retweet: "bg-[#e5f4ec] text-ok",
  repost: "bg-[#e5f4ec] text-ok",
  reply: "bg-[#f6ecdb] text-[#b8730b]",
  quote: "bg-[#efe6fb] text-[#7a4fd0]",
  image: "bg-[#fbe7f0] text-ig",
  video: "bg-[#fbe7f0] text-ig",
  carousel: "bg-[#fbe7f0] text-ig",
  reel: "bg-[#fbe7f0] text-ig",
};

export function PublicationCard({ pub }: { pub: SocialPublication }) {
  const open = () => {
    if (pub.url) chrome.tabs.create({ url: pub.url });
  };
  const author = pub.author.username ? `@${pub.author.username}` : "Publicação visível";
  const text =
    pub.text || (pub.is_placeholder ? "Dados básicos capturados pelo DOM" : "(sem legenda)");
  const badge = TYPE_CLASS[pub.type] ?? "bg-paper-2 text-ink-2";

  return (
    <button
      type="button"
      onClick={open}
      class="mt-2.5 block w-full rounded-xl border border-line bg-card p-3.5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:border-line-2"
    >
      <div class="mb-2 flex items-center gap-1.5">
        <span class={`rounded px-1.5 py-px font-mono text-[9px] font-semibold uppercase ${badge}`}>
          {labelType(pub.type)}
        </span>
        <time class="ml-auto font-mono text-[10px] text-ink-3">
          {pub.created_at ? formatDate(pub.created_at) : ""}
        </time>
      </div>
      <div class="mb-1 text-[11px] text-ink-3">{author}</div>
      <div class="mb-2.5 line-clamp-2 text-[13px] leading-snug text-ink">{text}</div>
      <div class="flex flex-wrap gap-3.5 text-[11px] text-ink-3">
        <span>
          <b
            class={`font-mono font-semibold ${pub.metrics.like_count > 10 ? "text-accent" : "text-ink"}`}
          >
            {fmt(pub.metrics.like_count)}
          </b>{" "}
          curtidas
        </span>
        <span>
          <b class="font-mono font-semibold text-ink">{fmt(pub.metrics.comment_count)}</b> coment.
        </span>
        <span>
          <b class="font-mono font-semibold text-ink">{fmt(pub.metrics.repost_count)}</b> reposts
        </span>
        <span>
          <b class="font-mono font-semibold text-ink">{fmt(pub.metrics.view_count)}</b> views
        </span>
      </div>
    </button>
  );
}
