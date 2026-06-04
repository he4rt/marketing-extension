import { describe, expect, test } from "bun:test";
import { createStore } from "../../../../src/background/controller";
import { enumerateTargets } from "../../../../src/providers/linkedin/active-fetch/targets";
import type { BackgroundStore, LinkedInPostData } from "../../../../src/shared/domain";

function postWith(id: string, activityUrn: string): LinkedInPostData {
  return {
    id,
    activity_urn: activityUrn,
    share_urn: "",
    text: "",
    type: "original",
    author: { urn: "", name: "", headline: "", avatar_url: "", vanity_name: "" },
    metrics: {
      like_count: 0,
      comment_count: 0,
      share_count: 0,
      total_reactions: 0,
      reaction_breakdown: {},
    },
    hashtags: [],
    media: [],
    created_at: "",
    timestamp_text: "",
    source: "search_sdui",
  };
}

function storeWithPosts(posts: LinkedInPostData[]): BackgroundStore {
  const store = createStore("");
  const lstore = store.platforms.linkedin.extra;
  for (const p of posts) {
    lstore.posts[p.id] = p;
    lstore.feedOrder.push(p.id);
  }
  return store;
}

describe("enumerateTargets (alvos de aprofundamento a partir do store)", () => {
  test("store vazio → nenhum alvo", () => {
    expect(enumerateTargets(createStore(""))).toEqual([]);
  });

  test("um post com activity_urn → um alvo com id e activityUrn", () => {
    const store = storeWithPosts([postWith("p1", "urn:li:activity:111")]);
    const targets = enumerateTargets(store);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ id: "urn:li:activity:111", activityUrn: "urn:li:activity:111" });
  });

  test("preserva a ordem do feedOrder", () => {
    const store = storeWithPosts([
      postWith("p1", "urn:li:activity:111"),
      postWith("p2", "urn:li:activity:222"),
      postWith("p3", "urn:li:activity:333"),
    ]);
    const urns = enumerateTargets(store).map((t) => t.activityUrn);
    expect(urns).toEqual(["urn:li:activity:111", "urn:li:activity:222", "urn:li:activity:333"]);
  });

  test("ignora posts sem activity_urn (não dá pra aprofundar)", () => {
    const store = storeWithPosts([postWith("p1", "urn:li:activity:111"), postWith("p2", "")]);
    const targets = enumerateTargets(store);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.activityUrn).toBe("urn:li:activity:111");
  });

  test("deduplica activity_urn repetidos", () => {
    const store = storeWithPosts([
      postWith("p1", "urn:li:activity:111"),
      postWith("p2", "urn:li:activity:111"),
    ]);
    expect(enumerateTargets(store)).toHaveLength(1);
  });

  test("ignora ids do feedOrder sem post correspondente (defensivo)", () => {
    const store = storeWithPosts([postWith("p1", "urn:li:activity:111")]);
    store.platforms.linkedin.extra.feedOrder.push("fantasma");
    expect(enumerateTargets(store)).toHaveLength(1);
  });
});
