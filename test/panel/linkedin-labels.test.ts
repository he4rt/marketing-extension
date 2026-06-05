import { describe, expect, test } from "bun:test";
import {
  discoveredLabel,
  unreadableLabel,
} from "../../src/panel/features/linkedin-discovery/labels";

// Rótulos da descoberta SDUI (semântica de busca). Migrados do popup.
describe("discoveredLabel", () => {
  test("pluraliza", () => {
    expect(discoveredLabel(1)).toBe("1 post descoberto");
    expect(discoveredLabel(3)).toBe("3 posts descobertos");
  });
});

describe("unreadableLabel", () => {
  test("vazio quando zero ou ausente", () => {
    expect(unreadableLabel(0)).toBe("");
    expect(unreadableLabel(undefined)).toBe("");
  });
  test("conta ilegíveis com parser drift", () => {
    expect(unreadableLabel(1)).toBe("1 ilegível (parser drift)");
    expect(unreadableLabel(2)).toBe("2 ilegíveis (parser drift)");
  });
});
