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

  // Shapes validados ao vivo (HTTP 200): reactions usa threadUrn, comments usa socialDetailUrn
  // (+ sortOrder), ambos com a URN da atividade PERCENT-ENCODADA (colons crus → 400). reposts
  // usa targetUrn (shape ainda não validado ao vivo). O parser decoda via searchParams.get.
  const ENC = encodeURIComponent("urn:li:activity:111"); // urn%3Ali%3Aactivity%3A111

  test("reactions: threadUrn com a URN encodada", () => {
    const vars = endpointDescriptor("socialDashReactions")?.buildVariables("urn:li:activity:111");
    expect(vars).toBe(`(count:10,start:0,threadUrn:${ENC})`);
    expect(vars).not.toContain("urn:li:activity:111"); // crua daria 400
  });

  test("comments: socialDetailUrn encodado + sortOrder (não a forma fsd_socialDetail tupla)", () => {
    const vars = endpointDescriptor("socialDashComments")?.buildVariables("urn:li:activity:111");
    expect(vars).toBe(`(count:10,start:0,socialDetailUrn:${ENC},sortOrder:RELEVANCE)`);
    expect(vars).not.toContain("fsd_socialDetail");
  });

  test("reposts: targetUrn com a URN encodada", () => {
    const vars = endpointDescriptor("feedDashReshareFeed")?.buildVariables("urn:li:activity:111");
    expect(vars).toBe(`(count:10,start:0,targetUrn:${ENC})`);
  });

  // buildVariables é urn-agnóstico: aceita tanto o activity urn quanto o ugcPost INLINE
  // (urn:li:ugcPost:<id>) descoberto na busca. O Active Fetch passa o ugcPost quando o
  // alvo o carrega — par real he4rt/ORG: ugcPost 7457926687662456833.
  test("buildVariables aceita o ugcPost urn e o encoda no mesmo shape", () => {
    const ugc = "urn:li:ugcPost:7457926687662456833";
    const encUgc = encodeURIComponent(ugc);
    expect(endpointDescriptor("socialDashReactions")?.buildVariables(ugc)).toBe(
      `(count:10,start:0,threadUrn:${encUgc})`,
    );
    expect(endpointDescriptor("socialDashComments")?.buildVariables(ugc)).toBe(
      `(count:10,start:0,socialDetailUrn:${encUgc},sortOrder:RELEVANCE)`,
    );
  });
});
