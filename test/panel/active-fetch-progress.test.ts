import { describe, expect, test } from "bun:test";
import { progressLabel } from "../../src/panel/features/active-fetch/progress";
import type { ActiveFetchStatusResponse } from "../../src/shared/messages";

// progressLabel traduz o status do fan-out em texto. O modo dry-run precisa deixar claro
// que NADA foi enviado (gate de ToS). Migrado de test/popup/active-fetch-control.test.ts.

function status(over: Partial<ActiveFetchStatusResponse>): ActiveFetchStatusResponse {
  return {
    running: false,
    total: 0,
    done: 0,
    actorsCaptured: 0,
    startedAt: null,
    finishedAt: null,
    dryRun: true,
    ...over,
  };
}

describe("progressLabel", () => {
  test("dry-run concluído avisa que nada foi enviado", () => {
    const label = progressLabel(status({ dryRun: true, finishedAt: "t", total: 15, done: 15 }));
    expect(label).toContain("planejados");
    expect(label).toContain("dry-run");
  });

  test("dry-run rodando rotula como simulação", () => {
    const label = progressLabel(status({ dryRun: true, running: true, total: 15, done: 6 }));
    expect(label).toBe("Simulando 6/15…");
  });

  test("run real concluído conta Actors", () => {
    const label = progressLabel(
      status({ dryRun: false, finishedAt: "t", total: 5, done: 5, actorsCaptured: 42 }),
    );
    expect(label).toBe("✓ 5/5 aprofundados · 42 Actors");
  });

  test("erro tem precedência sobre o modo", () => {
    const label = progressLabel(status({ dryRun: false, error: "uncalibrated" }));
    expect(label).toContain("calibrar");
  });
});
