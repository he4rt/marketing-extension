import { describe, expect, test } from "bun:test";
import { tokenizeFlight } from "../../../../../src/providers/linkedin/search/sdui/flight-parser";

describe("tokenizeFlight", () => {
  test("indexa linhas hex→conteúdo (conteúdo após o primeiro ':')", () => {
    const raw = ['1:"$Sreact.fragment"', '40:["$","span",{"children":"oi"}]'].join("\n");
    const { byId } = tokenizeFlight(raw);
    expect(byId.get("1")).toBe('"$Sreact.fragment"');
    // o ':' interno do JSON NÃO corta a linha — só o prefixo hex importa.
    expect(byId.get("40")).toBe('["$","span",{"children":"oi"}]');
  });

  test("resolveRef aceita as três formas de ref ($L, $, hex puro)", () => {
    const { resolveRef } = tokenizeFlight("40:conteudo-da-linha");
    expect(resolveRef("$L40")).toBe("conteudo-da-linha");
    expect(resolveRef("$40")).toBe("conteudo-da-linha");
    expect(resolveRef("40")).toBe("conteudo-da-linha");
  });

  test("resolveRef devolve null para ref inexistente ou marcador não-linha", () => {
    const { resolveRef } = tokenizeFlight("40:x");
    expect(resolveRef("$L99")).toBeNull();
    expect(resolveRef("$undefined")).toBeNull();
    expect(resolveRef("$")).toBeNull();
    expect(resolveRef("")).toBeNull();
  });

  test("ignora linhas sem ':' ou sem prefixo hex válido", () => {
    const raw = ["linha-sem-dois-pontos", "ZZ:nao-e-hex", "1a:ok"].join("\n");
    const { byId } = tokenizeFlight(raw);
    expect(byId.size).toBe(1);
    expect(byId.get("1a")).toBe("ok");
  });

  test("string vazia → tabelas vazias e resolveRef sempre null", () => {
    const { byId, resolveRef } = tokenizeFlight("");
    expect(byId.size).toBe(0);
    expect(resolveRef("$L40")).toBeNull();
  });

  test("id duplicado: a primeira ocorrência vence", () => {
    const { byId } = tokenizeFlight(["40:primeiro", "40:segundo"].join("\n"));
    expect(byId.get("40")).toBe("primeiro");
  });
});
