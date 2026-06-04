import { describe, expect, test } from "bun:test";
import type { ScopeMode } from "../src/providers/contract";
import { instagramProvider, scopeModes as instagramScopeModes } from "../src/providers/instagram";
import { linkedinProvider, scopeModes as linkedinScopeModes } from "../src/providers/linkedin";
import { xProvider, scopeModes as xScopeModes } from "../src/providers/x";
import type { SocialProvider, SocialPublication } from "../src/shared/domain";

// Cobre o seam de Scope (#9): cada provider DECLARA o modo "profile" e a predicate
// selects() casa corretamente para uma publicação de exemplo, espelhando o filtro real
// (igualdade de username para X/IG; substring do nome da organização para LinkedIn).

function makePublication(
  provider: SocialProvider,
  author: { username: string; name: string },
): SocialPublication {
  return {
    provider,
    publication_id: "1",
    text: "",
    created_at: "",
    type: "original",
    author: {
      provider,
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

function profileMode(modes: ScopeMode[]): ScopeMode {
  const mode = modes.find((m) => m.id === "profile");
  if (!mode) throw new Error("provider does not declare a 'profile' scope mode");
  return mode;
}

const cases: Array<{ provider: SocialProvider; modes: ScopeMode[]; facetId: SocialProvider }> = [
  { provider: "x", modes: xScopeModes, facetId: xProvider.id },
  { provider: "instagram", modes: instagramScopeModes, facetId: instagramProvider.id },
  { provider: "linkedin", modes: linkedinScopeModes, facetId: linkedinProvider.id },
];

describe("scope seam — each provider declares the 'profile' mode", () => {
  for (const { provider, modes } of cases) {
    test(`${provider} declares a 'profile' scope mode`, () => {
      const mode = profileMode(modes);
      expect(mode.id).toBe("profile");
      expect(typeof mode.label).toBe("string");
      expect(typeof mode.selects).toBe("function");
    });
  }

  test("provider facet id matches its provider", () => {
    for (const { provider, facetId } of cases) {
      expect(facetId).toBe(provider);
    }
  });
});

describe("scope 'profile' selects() — username equality (X / Instagram)", () => {
  for (const provider of ["x", "instagram"] as const) {
    const modes = provider === "x" ? xScopeModes : instagramScopeModes;
    const mode = profileMode(modes);

    test(`${provider}: matches the tracked username (case-insensitive)`, () => {
      const pub = makePublication(provider, { username: "He4rtDevs", name: "He4rt Devs" });
      expect(mode.selects(pub, "he4rtdevs")).toBe(true);
      expect(mode.selects(pub, "He4rtDevs")).toBe(true);
    });

    test(`${provider}: rejects a different username`, () => {
      const pub = makePublication(provider, { username: "He4rtDevs", name: "He4rt Devs" });
      expect(mode.selects(pub, "someoneelse")).toBe(false);
    });
  }
});

describe("scope 'profile' selects() — organization name substring (LinkedIn)", () => {
  const mode = profileMode(linkedinScopeModes);

  test("matches when the author name contains the org value (case-insensitive)", () => {
    const pub = makePublication("linkedin", {
      username: "he4rt_developers",
      name: "He4rt Developers",
    });
    expect(mode.selects(pub, "He4rt Developers")).toBe(true);
    expect(mode.selects(pub, "he4rt developers")).toBe(true);
    // substring is enough — mirrors linkedinFeedToPublications name.includes(handle)
    expect(mode.selects(pub, "He4rt")).toBe(true);
  });

  test("rejects when the author name does not contain the org value", () => {
    const pub = makePublication("linkedin", {
      username: "he4rt_developers",
      name: "He4rt Developers",
    });
    expect(mode.selects(pub, "Other Company")).toBe(false);
  });
});

describe("scope 'profile' detectFromPage — extrai o alvo da URL (X / Instagram)", () => {
  const xProfile = profileMode(xScopeModes);
  const igProfile = profileMode(instagramScopeModes);

  test("X e Instagram declaram detectFromPage", () => {
    expect(typeof xProfile.detectFromPage).toBe("function");
    expect(typeof igProfile.detectFromPage).toBe("function");
  });

  test("X: detecta o handle em x.com/<handle>", () => {
    expect(xProfile.detectFromPage?.("https://x.com/He4rtDevs")).toBe("He4rtDevs");
    expect(xProfile.detectFromPage?.("https://twitter.com/He4rtDevs/")).toBe("He4rtDevs");
  });

  test("X: retorna null para URLs que não são perfil", () => {
    for (const url of [
      "https://x.com/home",
      "https://x.com/explore",
      "https://x.com/search?q=he4rt",
      "https://x.com/He4rtDevs/status/100",
      "https://x.com/i/timeline",
    ]) {
      expect(xProfile.detectFromPage?.(url)).toBeNull();
    }
  });

  test("Instagram: detecta o username em instagram.com/<username>", () => {
    expect(igProfile.detectFromPage?.("https://www.instagram.com/he4rtdevs/")).toBe("he4rtdevs");
  });

  test("Instagram: retorna null para posts/reels/explore/stories", () => {
    for (const url of [
      "https://www.instagram.com/p/ABC123/",
      "https://www.instagram.com/reel/REEL456/",
      "https://www.instagram.com/explore/",
      "https://www.instagram.com/stories/he4rt/",
    ]) {
      expect(igProfile.detectFromPage?.(url)).toBeNull();
    }
  });
});
