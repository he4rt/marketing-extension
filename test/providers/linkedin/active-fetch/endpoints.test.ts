import { describe, expect, test } from "bun:test";
import {
  endpointDescriptor,
  VOYAGER_ENDPOINTS,
  voyagerEndpointIds,
} from "../../../../src/providers/linkedin/active-fetch/endpoints";

// Descritores dos 3 endpoints Voyager aprofundados pelo Active Fetch (L3).
// São puros: não tocam chrome.*, só descrevem como montar a URL de cada endpoint.

describe("endpoints (descritores Voyager L3)", () => {
  test("declara exatamente os 3 endpoints lógicos do L3", () => {
    expect(voyagerEndpointIds()).toEqual([
      "socialDashReactions",
      "socialDashComments",
      "feedDashReshareFeed",
    ]);
  });

  test("cada descritor aponta para o campo de queryId correto na calibração", () => {
    expect(endpointDescriptor("socialDashReactions")?.queryIdField).toBe("queryId_reactions");
    expect(endpointDescriptor("socialDashComments")?.queryIdField).toBe("queryId_comments");
    expect(endpointDescriptor("feedDashReshareFeed")?.queryIdField).toBe("queryId_reposts");
  });

  test("descritor desconhecido devolve null (defensivo)", () => {
    expect(endpointDescriptor("naoExiste")).toBeNull();
  });

  test("o registro é congelado para evitar mutação acidental", () => {
    expect(Object.isFrozen(VOYAGER_ENDPOINTS)).toBe(true);
  });

  // O parser de reactions casa /urn:li:activity:(\d+)/ no variables; o de reposts casa
  // targetUrn:<urn>. Os builders precisam produzir variables com esses formatos.
  test("buildVariables de reactions injeta a URN da atividade", () => {
    const desc = endpointDescriptor("socialDashReactions");
    const vars = desc?.buildVariables("urn:li:activity:7465277392866037760");
    expect(vars).toContain("urn:li:activity:7465277392866037760");
  });

  test("buildVariables de comments injeta a URN da atividade", () => {
    const desc = endpointDescriptor("socialDashComments");
    const vars = desc?.buildVariables("urn:li:activity:111");
    expect(vars).toContain("urn:li:activity:111");
  });

  test("buildVariables de reposts injeta a URN da atividade como targetUrn", () => {
    const desc = endpointDescriptor("feedDashReshareFeed");
    const vars = desc?.buildVariables("urn:li:activity:111");
    expect(vars).toContain("targetUrn:urn:li:activity:111");
  });
});
