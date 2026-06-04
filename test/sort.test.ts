import { describe, expect, test } from "bun:test";
import type { SocialPublication } from "../src/shared/domain";
import { sortPublications } from "../src/shared/sort";

function pub(overrides: Partial<SocialPublication> = {}): SocialPublication {
  return {
    provider: "x",
    publication_id: "1",
    text: "",
    created_at: "2025-01-01T00:00:00Z",
    type: "original",
    author: {
      provider: "x",
      provider_user_id: "id-1",
      username: "test",
      name: "Test",
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
    ...overrides,
  };
}

describe("sortPublications", () => {
  test("returns new array (immutable)", () => {
    const pubs = [pub({ publication_id: "1" })];
    const result = sortPublications(pubs);
    expect(result).not.toBe(pubs);
  });

  test("does not mutate input", () => {
    const pubs = [pub({ publication_id: "1" })];
    const copy = [...pubs];
    sortPublications(pubs);
    expect(pubs).toEqual(copy);
  });

  test("sorts by visible_order ascending", () => {
    const a = pub({ publication_id: "a", visible_order: 2 });
    const b = pub({ publication_id: "b", visible_order: 1 });
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("b");
    expect(sorted[1]?.publication_id).toBe("a");
  });

  test("null visible_order sorts after defined values", () => {
    const a = pub({ publication_id: "a" });
    const b = pub({ publication_id: "b", visible_order: 1 });
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("b");
    expect(sorted[1]?.publication_id).toBe("a");
  });

  test("ties visible_order by capture_priority ascending", () => {
    const a = pub({ publication_id: "a", visible_order: 1, capture_priority: 200 });
    const b = pub({ publication_id: "b", visible_order: 1, capture_priority: 100 });
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("b");
    expect(sorted[1]?.publication_id).toBe("a");
  });

  test("default capture_priority is 100", () => {
    const a = pub({ publication_id: "a", capture_priority: 200 });
    const b = pub({ publication_id: "b" });
    // b default 100 < a default 200 -> b first
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("b");
  });

  test("ties capture_priority by capture_order ascending", () => {
    const a = pub({ publication_id: "a", visible_order: 1, capture_order: 10 });
    const b = pub({ publication_id: "b", visible_order: 1, capture_order: 5 });
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("b");
    expect(sorted[1]?.publication_id).toBe("a");
  });

  test("null capture_order sorts after defined", () => {
    const a = pub({ publication_id: "a", visible_order: 1 });
    const b = pub({ publication_id: "b", visible_order: 1, capture_order: 5 });
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("b");
    expect(sorted[1]?.publication_id).toBe("a");
  });

  test("ties capture_order by created_at descending", () => {
    const a = pub({ publication_id: "a", created_at: "2025-01-02T00:00:00Z", visible_order: 1 });
    const b = pub({ publication_id: "b", created_at: "2025-01-01T00:00:00Z", visible_order: 1 });
    const sorted = sortPublications([a, b]);
    expect(sorted[0]?.publication_id).toBe("a");
    expect(sorted[1]?.publication_id).toBe("b");
  });
});
