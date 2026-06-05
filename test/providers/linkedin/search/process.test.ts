import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../../../../src/background/controller";
import type { RuntimeMessage } from "../../../../src/shared/messages";

// Streams SDUI real-shaped mínimos: cabeçalho de post (feed-actor + for post by + URN) e
// a linha de contadores de reação. Simulam o render inicial (sem métricas) e os streams
// preguiçosos rsc-action/pagination/component (com métricas), que entram pelo MESMO
// endpoint lógico "searchResultsContent".
const header = (urn: string, name: string) =>
  `10:["$","div",null,{"controlName":"feed-actor",` +
  `"a11yText":"Open control menu for post by ${name}","href":"/in/ada",` +
  `"update":"urn:li:activity:${urn}"}]`;

const withReactions = (urn: string, value: number) =>
  [
    header(urn, "Ada"),
    `2:[{"key":{"value":{"$case":"id","id":"ReactionType_LIKE_urn:li:activity:${urn}"}}},` +
      `"value":{"$case":"intValue","intValue":${value}}}]`,
  ].join("\n");

const SEARCH_URL = "https://www.linkedin.com/search/results/content/?keywords=Laravel";

function capture(send: (r: RuntimeMessage) => unknown, payload: string) {
  return send({
    action: "CAPTURED_PAYLOAD",
    provider: "linkedin",
    endpoint: "searchResultsContent",
    payload,
    pageUrl: SEARCH_URL,
    timestamp: "2026-06-04T00:00:00.000Z",
  });
}

function likeCount(store: ReturnType<typeof createStore>, urn: string): number | undefined {
  return store.platforms.linkedin.publications[`linkedin:urn:li:activity:${urn}`]?.metrics
    .like_count;
}

function breakdown(
  store: ReturnType<typeof createStore>,
  urn: string,
): Record<string, number> | undefined {
  return store.platforms.linkedin.extra.posts[`urn:li:activity:${urn}`]?.metrics.reaction_breakdown;
}

describe("processLinkedInSearchCapture — merge de métricas entre capturas", () => {
  test("captura sem métricas NÃO rebaixa uma anterior com engajamento", () => {
    const store = createStore();
    const send = (r: RuntimeMessage) => handleRuntimeMessage(store, r, {});
    capture(send, withReactions("7", 42)); // pagination/component: com métricas
    capture(send, header("7", "Ada")); // re-render sem métricas
    expect(likeCount(store, "7")).toBe(42);
  });

  test("métricas chegando DEPOIS preenchem um post descoberto sem elas", () => {
    const store = createStore();
    const send = (r: RuntimeMessage) => handleRuntimeMessage(store, r, {});
    capture(send, header("8", "Ada")); // render inicial: sem métricas
    capture(send, withReactions("8", 13)); // lazy: com métricas
    expect(likeCount(store, "8")).toBe(13);
  });

  test("reaction_breakdown é populado e NÃO rebaixado por re-captura sem reações", () => {
    const store = createStore();
    const send = (r: RuntimeMessage) => handleRuntimeMessage(store, r, {});
    capture(send, withReactions("9", 7)); // com reações → breakdown {LIKE:7}
    expect(breakdown(store, "9")).toEqual({ LIKE: 7 });
    capture(send, header("9", "Ada")); // re-render sem reações
    expect(breakdown(store, "9")).toEqual({ LIKE: 7 }); // preservado
  });
});
