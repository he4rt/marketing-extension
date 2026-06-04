import { describe, expect, test } from "bun:test";
import type { ScopeMode } from "../../../../src/providers/contract";
import { searchScopeMode } from "../../../../src/providers/linkedin/search/scope";
import type { SocialPublication } from "../../../../src/shared/domain";

// Cobre o ScopeMode "search" do LinkedIn (#16, spec Passo 5). Diferente do "profile":
// detectFromPage lê ?keywords= da URL do SRP (Search Results Page); selects() retorna
// SEMPRE true porque o LinkedIn já filtrou no servidor — tudo que chega por uma captura
// de busca é, por definição, in-scope (não há re-filtro no cliente — YAGNI da spec).

function makePublication(author: { username: string; name: string }): SocialPublication {
  return {
    provider: "linkedin",
    publication_id: "urn:li:activity:1",
    text: "",
    created_at: "",
    type: "original",
    author: {
      provider: "linkedin",
      provider_user_id: "id-1",
      username: author.username,
      name: author.name,
      avatar_url: "",
    },
    metrics: {
      bookmark_count: 0,
      comment_count: 0,
      like_count: 0,
      quote_count: 0,
      reply_count: 0,
      repost_count: 0,
      retweet_count: 0,
      save_count: 0,
      view_count: 0,
    },
    hashtags: [],
    user_mentions: [],
    media_count: 0,
    urls: [],
    url: "",
  };
}

describe("LinkedIn search ScopeMode — shape", () => {
  test("declara id='search', label string e selects/detectFromPage funções", () => {
    const mode: ScopeMode = searchScopeMode;
    expect(mode.id).toBe("search");
    expect(typeof mode.label).toBe("string");
    expect(typeof mode.selects).toBe("function");
    expect(typeof mode.detectFromPage).toBe("function");
  });
});

describe("LinkedIn search detectFromPage — lê ?keywords= da URL do SRP", () => {
  const mode = searchScopeMode;

  test("extrai a query simples de keywords", () => {
    expect(
      mode.detectFromPage?.("https://www.linkedin.com/search/results/content/?keywords=Laravel"),
    ).toBe("Laravel");
  });

  test("decodifica espaços (+/%20) de uma query multi-palavra", () => {
    expect(
      mode.detectFromPage?.(
        "https://www.linkedin.com/search/results/content/?keywords=Laravel+Day+SP",
      ),
    ).toBe("Laravel Day SP");
    expect(
      mode.detectFromPage?.(
        "https://www.linkedin.com/search/results/content/?keywords=Laravel%20Day%20SP",
      ),
    ).toBe("Laravel Day SP");
  });

  test("convive com outros query params (origin, sid, …)", () => {
    expect(
      mode.detectFromPage?.(
        "https://www.linkedin.com/search/results/content/?keywords=He4rt&origin=SWITCH_SEARCH_VERTICAL&sid=abc",
      ),
    ).toBe("He4rt");
  });

  test("retorna null quando não há keywords na URL", () => {
    for (const url of [
      "https://www.linkedin.com/search/results/content/",
      "https://www.linkedin.com/feed/",
      "https://www.linkedin.com/search/results/people/?keywords=",
    ]) {
      // keywords ausente → null; keywords vazio ("") permanece "" (presença), não null.
      const got = mode.detectFromPage?.(url);
      if (url.includes("keywords=")) {
        expect(got).toBe("");
      } else {
        expect(got).toBeNull();
      }
    }
  });
});

describe("LinkedIn search selects() — LinkedIn já filtrou no servidor → sempre true", () => {
  const mode = searchScopeMode;

  test("seleciona qualquer publicação, independente do autor ou do valor", () => {
    const pub = makePublication({ username: "qualquer", name: "Qualquer Pessoa" });
    expect(mode.selects(pub, "Laravel Day SP")).toBe(true);
    expect(mode.selects(pub, "outra coisa")).toBe(true);
    expect(mode.selects(pub, "")).toBe(true);
  });
});
