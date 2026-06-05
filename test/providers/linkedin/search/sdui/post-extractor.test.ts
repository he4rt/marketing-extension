import { describe, expect, test } from "bun:test";
import { tokenizeFlight } from "../../../../../src/providers/linkedin/search/sdui/flight-parser";
import {
  extractPublication,
  findPostNodes,
} from "../../../../../src/providers/linkedin/search/sdui/post-extractor";

// Cabeçalho de post real-shaped: `feed-actor` + URN + "for post by <nome>" + /in/<vanity>
// + ref de commentary_text. (O stream real usa essa estrutura; o fixture sintético antigo
// usava `reactionState`/`memberFirstName`, que NÃO casam com o LinkedIn de verdade.)
const header = (urn: string, name: string, vanity: string, textRef: string) =>
  `10:["$","div",null,{"controlName":"feed-actor",` +
  `"a11yText":"Open control menu for post by ${name}","href":"/in/${vanity}",` +
  `"x":{"legacyControlName":"commentary_text"},"children":"$L${textRef}",` +
  `"update":"urn:li:activity:${urn}"}]`;

const textLine = (ref: string, text: string) => `${ref}:["$","span",null,{"children":"${text}"}]`;

const reactionLine = (urn: string, type: string, value: number) =>
  `2:[{"key":{"value":{"$case":"id","id":"ReactionType_${type}_urn:li:activity:${urn}"}}},` +
  `"value":{"$case":"intValue","intValue":${value}}}]`;

function firstNode(tables: ReturnType<typeof tokenizeFlight>) {
  const node = findPostNodes(tables)[0];
  if (!node) throw new Error("esperava ao menos um nó de post");
  return node;
}

describe("findPostNodes", () => {
  test("um nó por cabeçalho (feed-actor + URN de atividade)", () => {
    const tables = tokenizeFlight(header("55", "Ada Lovelace", "ada-l", "40"));
    const nodes = findPostNodes(tables);
    expect(nodes.length).toBe(1);
    expect(nodes[0]?.activityUrn).toBe("urn:li:activity:55");
  });

  test("linhas sem feed-actor não viram nós", () => {
    const tables = tokenizeFlight('1:"$Sreact.fragment"');
    expect(findPostNodes(tables).length).toBe(0);
  });
});

describe("extractPublication", () => {
  test("nome do autor vem de 'for post by'; vanity vira username", () => {
    const tables = tokenizeFlight(header("7", "Ada Lovelace", "ada-lovelace", "40"));
    const pub = extractPublication(firstNode(tables), tables);
    expect(pub?.author.name).toBe("Ada Lovelace");
    expect(pub?.author.username).toBe("ada-lovelace");
    expect(pub?.publication_id).toBe("urn:li:activity:7");
    expect(pub?.source).toBe("search_sdui");
  });

  test("texto resolvido via ref commentary_text", () => {
    const raw = [header("7", "Ada", "ada", "40"), textLine("40", "Post sobre Laravel")].join("\n");
    const tables = tokenizeFlight(raw);
    const pub = extractPublication(firstNode(tables), tables);
    expect(pub?.text).toBe("Post sobre Laravel");
  });

  test("métricas: soma reações inline pela URN do post", () => {
    const raw = [header("7", "Ada", "ada", "40"), reactionLine("7", "LIKE", 40)].join("\n");
    const tables = tokenizeFlight(raw);
    const pub = extractPublication(firstNode(tables), tables);
    expect(pub?.metrics.like_count).toBe(40);
  });

  test("cabeçalho sem nome de autor → null (drift)", () => {
    const tables = tokenizeFlight(
      '10:["$","div",null,{"controlName":"feed-actor","update":"urn:li:activity:9"}]',
    );
    expect(extractPublication(firstNode(tables), tables)).toBeNull();
  });
});
