import type { SocialPublication } from "../../../../shared/domain";
import { tokenizeFlight } from "./flight-parser";
import { reactionBreakdown } from "./metrics-reader";
import { extractPublication, findPostNodes } from "./post-extractor";

// Resultado da varredura SDUI da busca: publicações reconhecidas + contagem de nós
// ilegíveis (shape em drift) + o reaction_breakdown por publication_id (riqueza que o
// export preserva, invariante #3). O `unreadable` é o sinal de saúde do parser na UI.
export type SduiSearchResult = {
  publications: SocialPublication[];
  unreadable: number;
  breakdowns: Record<string, Record<string, number>>;
};

// Orquestra a leitura do stream Flight da busca do LinkedIn:
//   raw → tokenizeFlight → findPostNodes → extractPublication[] → resultado.
//
// PURA e DEFENSIVA: NUNCA lança. raw vazio/truncado → { publications: [], unreadable: 0 }.
// Cada nó: try → extractPublication; sucesso → push; null/exceção → unreadable++.
// Dedup por publication_id (mesma atividade não entra duas vezes).
export function parseLinkedInSearchSdui(raw: string): SduiSearchResult {
  const publications: SocialPublication[] = [];
  const breakdowns: Record<string, Record<string, number>> = {};
  let unreadable = 0;

  try {
    const tables = tokenizeFlight(raw);
    const nodes = findPostNodes(tables);
    const seen = new Set<string>();

    for (const node of nodes) {
      try {
        const pub = extractPublication(node, tables);
        if (!pub) {
          unreadable++;
          continue;
        }
        if (seen.has(pub.publication_id)) continue;
        seen.add(pub.publication_id);
        publications.push(pub);
        breakdowns[pub.publication_id] = reactionBreakdown(pub.publication_id, tables);
      } catch {
        unreadable++;
      }
    }
  } catch {
    // Falha catastrófica do tokenizer → trata como nada legível, sem propagar.
    return { publications: [], unreadable: 0, breakdowns: {} };
  }

  return { publications, unreadable, breakdowns };
}
