import { describe, expect, test } from "bun:test";
import { fmt, labelType, plural } from "../../src/panel/lib/format";

// Helpers de formatação puros do painel (extraídos do popup).
describe("fmt", () => {
  test("compacta milhares e milhões", () => {
    expect(fmt(999)).toBe("999");
    expect(fmt(1200)).toBe("1.2K");
    expect(fmt(2_400_000)).toBe("2.4M");
  });
});

describe("labelType", () => {
  test("mapeia tipos conhecidos e devolve o cru no desconhecido", () => {
    expect(labelType("repost")).toBe("repost");
    expect(labelType("carousel")).toBe("carrossel");
    expect(labelType("xpto")).toBe("xpto");
  });
});

describe("plural", () => {
  test("escolhe singular/plural por contagem", () => {
    expect(plural(1, "publicação", "publicações")).toBe("publicação");
    expect(plural(2, "publicação", "publicações")).toBe("publicações");
  });
});
