// Helpers de formatação puros do painel — extraídos do popup legado (popup/index.ts).
// Sem DOM, sem chrome.*: fáceis de testar isoladamente. NOTA: `escapeHtml` do popup
// não migra — JSX escapa texto automaticamente, então a injeção some por construção.

// Rótulos humanos dos tipos de publicação (X/Instagram/LinkedIn).
const TYPE_LABELS: Record<string, string> = {
  carousel: "carrossel",
  image: "imagem",
  original: "original",
  quote: "quote",
  reel: "reel",
  reply: "resposta",
  repost: "repost",
  retweet: "retweet",
  unknown: "tipo incerto",
  video: "video",
};

export function labelType(type: string): string {
  return TYPE_LABELS[type] || type;
}

export function plural(count: number, singular: string, pluralText: string): string {
  return count === 1 ? singular : pluralText;
}

// "dd/MM HH:mm" no fuso local; devolve a string crua se não for uma data válida.
export function formatDate(str: string): string {
  try {
    const d = new Date(str);
    const day = d.getDate().toString().padStart(2, "0");
    const mon = (d.getMonth() + 1).toString().padStart(2, "0");
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${day}/${mon} ${h}:${m}`;
  } catch {
    return str;
  }
}

// Compacta números grandes: 1.2K, 3.4M.
export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
