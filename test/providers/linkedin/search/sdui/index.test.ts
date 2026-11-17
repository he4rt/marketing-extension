import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLinkedInSearchSdui } from "../../../../../src/providers/linkedin/search/sdui";

// Fixtures REAIS (recortes fiéis do .har de uma SRP de conteúdo do LinkedIn). MIN = 1 post;
// o .txt = 3 posts. As linhas de cabeçalho foram truncadas só por tamanho — o shape (Flight
// React-Server-Components) é o do LinkedIn de verdade, não um JSON normalizado fabricado.
const FIXTURES = join(import.meta.dir, "../../../../fixtures");
const MIN = readFileSync(join(FIXTURES, "linkedin-search-sdui.min.txt"), "utf8");
const REAL = readFileSync(join(FIXTURES, "linkedin-search-sdui.txt"), "utf8");

describe("parseLinkedInSearchSdui — fixture real (3 posts)", () => {
  const { publications, unreadable } = parseLinkedInSearchSdui(REAL);

  test("extrai os 3 posts da SRP sem ilegíveis", () => {
    expect(publications.length).toBe(3);
    expect(unreadable).toBe(0);
  });

  test("autor real vem do cabeçalho (não do visitante logado)", () => {
    const umar = publications.find(
      (p) => p.publication_id === "urn:li:activity:7466899297645649920",
    );
    expect(umar?.author.name).toBe("Umar Waqas");
    expect(umar?.author.username).toBe("umar-waqas");
  });

  test("métricas reais: reações somadas + comentários + reposts", () => {
    const nehal = publications.find(
      (p) => p.publication_id === "urn:li:activity:7465277392866037760",
    );
    expect(nehal?.metrics.like_count).toBe(102);
    expect(nehal?.metrics.comment_count).toBe(28);
    expect(nehal?.metrics.repost_count).toBe(1);
    const umar = publications.find(
      (p) => p.publication_id === "urn:li:activity:7466899297645649920",
    );
    expect(umar?.metrics.like_count).toBe(33);
    expect(umar?.metrics.repost_count).toBe(8);
  });

  test("texto do post resolvido via ref commentary_text", () => {
    const umar = publications.find(
      (p) => p.publication_id === "urn:li:activity:7466899297645649920",
    );
    expect(umar?.text).toContain("12 Laravel functions");
  });

  test("reaction_breakdown por tipo é exposto por publication_id (invariante #3)", () => {
    const { breakdowns } = parseLinkedInSearchSdui(REAL);
    expect(breakdowns["urn:li:activity:7466899297645649920"]).toEqual({ LIKE: 31, EMPATHY: 2 });
    expect(breakdowns["urn:li:activity:7465277392866037760"]).toEqual({
      LIKE: 90,
      INTEREST: 2,
      APPRECIATION: 10,
    });
  });

  test("shape básico (provider/source/type/url)", () => {
    for (const p of publications) {
      expect(p.provider).toBe("linkedin");
      expect(p.source).toBe("search_sdui");
      expect(p.type).toBe("original");
      expect(p.url).toContain(p.publication_id);
      expect(p.publication_id).toMatch(/^urn:li:activity:\d+$/);
      expect(p.scope_mode).toBeUndefined(); // provenance vive no mapa lateral (v3)
    }
  });
});

describe("parseLinkedInSearchSdui — fixture mínima (1 post)", () => {
  test("MIN extrai exatamente 1 post, 0 ilegíveis", () => {
    const { publications, unreadable } = parseLinkedInSearchSdui(MIN);
    expect(publications.length).toBe(1);
    expect(unreadable).toBe(0);
    expect(publications[0]?.author.name).toBe("Umar Waqas");
  });
});

describe("parseLinkedInSearchSdui — defensivo", () => {
  test("string vazia → { publications: [], unreadable: 0 } sem throw", () => {
    expect(parseLinkedInSearchSdui("")).toEqual({
      publications: [],
      unreadable: 0,
      breakdowns: {},
      rawNodes: {},
    });
  });

  test("string truncada/lixo → não lança, retorna vazio-ish", () => {
    const r = parseLinkedInSearchSdui('2:[{"key":');
    expect(r.publications.length).toBe(0);
    expect(r.unreadable).toBeGreaterThanOrEqual(0);
  });

  test("cabeçalho sem nome de autor → unreadable++, não entra", () => {
    const drift =
      '10:["$","div",null,{"controlName":"feed-actor","update":"urn:li:activity:9001"}]';
    const { publications, unreadable } = parseLinkedInSearchSdui(drift);
    expect(publications.length).toBe(0);
    expect(unreadable).toBe(1);
  });

  test("dedup: mesma atividade em dois cabeçalhos entra uma vez só", () => {
    const line = (id: string) =>
      `${id}:["$","div",null,{"controlName":"feed-actor",` +
      `"a11yText":"Open control menu for post by Ana","href":"/in/ana",` +
      `"update":"urn:li:activity:9003"}]`;
    const dup = [line("10"), line("20")].join("\n");
    expect(parseLinkedInSearchSdui(dup).publications.length).toBe(1);
  });
});
