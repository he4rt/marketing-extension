import type { FlightTables } from "./flight-parser";

type AnyRecord = Record<string, unknown>;

// Coleta recursivamente os textos-folha de uma árvore React-Flight resolvida.
// Regra: strings reais de conteúdo vivem como ITENS de arrays `children`/`textProps`.
// Ignoramos marcadores estruturais ("$", "$1", "$L40", "$undefined") e props de
// não-texto (className/url/etc., em que não recursamos). Defensivo: nunca lança.
function collectText(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    if (node.length === 0 || node.startsWith("$")) return;
    out.push(node);
    return;
  }
  if (!Array.isArray(node)) return;

  // Elemento Flight: ["$", tag, key, props] → recursa nos children e textProps.children.
  if (node[0] === "$" && node.length >= 4 && node[3] && typeof node[3] === "object") {
    const props = node[3] as AnyRecord;
    collectText(props.children, out);
    collectText((props.textProps as AnyRecord)?.children, out);
    return;
  }
  for (const item of node) collectText(item, out);
}

// Localiza, no cabeçalho do post, a ref do corpo do post: o componente cujo
// `legacyControlName` é "commentary_text" aponta o texto via `children:"$L<hex>"`.
// (O leitor antigo lia `authorObj.commentary.children` — caminho do fixture sintético,
// inexistente no stream real.)
const COMMENTARY_REF = /"legacyControlName":"commentary_text"\},"children":"(\$L[0-9a-f]+)"/;

// Resolve a ref de commentary_text e devolve o texto concatenado do post. Ref ausente/
// quebrada → "" (post entra parcial; autor/métricas ainda valem). Nunca lança.
export function extractText(rawObject: string, tables: FlightTables): string {
  const ref = COMMENTARY_REF.exec(rawObject)?.[1];
  const lineRaw = ref ? tables.resolveRef(ref) : null;
  if (!lineRaw) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(lineRaw);
  } catch {
    return "";
  }

  const parts: string[] = [];
  collectText(parsed, parts);
  return parts
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
