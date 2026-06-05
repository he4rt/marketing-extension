import { describe, expect, test } from "bun:test";
import { engagerSummary } from "../../src/panel/features/linkedin-discovery/engagers";

// O GET_PLATFORM_DATA do LinkedIn entrega engagers como {captured,total} (não arrays).
// Este helper documenta/garante esse shape — tratar como array quebrava o render do detalhe.
describe("engagerSummary", () => {
  test("capturado igual ao total mostra só o número", () => {
    expect(engagerSummary({ captured: 12, total: 12 })).toBe("12");
  });
  test("total maior que capturado mostra capturado/total", () => {
    expect(engagerSummary({ captured: 12, total: 40 })).toBe("12/40");
  });
  test("ausente vira 0", () => {
    expect(engagerSummary(undefined)).toBe("0");
  });
});
