import { describe, expect, test } from "bun:test";
import { registry } from "../../../src/providers/linkedin/process/registry";

describe("LinkedIn endpoint processor registry", () => {
  test("maps searchResultsContent", () => {
    expect(registry.searchResultsContent).toBeDefined();
  });

  test("maps feedDashOrganizationalPageUpdates", () => {
    expect(registry.feedDashOrganizationalPageUpdates).toBeDefined();
  });

  test("maps socialDashReactions", () => {
    expect(registry.socialDashReactions).toBeDefined();
  });

  test("maps feedDashReshareFeed", () => {
    expect(registry.feedDashReshareFeed).toBeDefined();
  });

  test("maps socialDashComments", () => {
    expect(registry.socialDashComments).toBeDefined();
  });

  test("search process capture is registered endpoint", () => {
    const p = registry.searchResultsContent;
    expect(p?.endpoint).toBe("searchResultsContent");
    expect(typeof p?.process).toBe("function");
  });
});
