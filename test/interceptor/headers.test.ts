import { describe, expect, test } from "bun:test";
import { normalizeHeaders } from "../../src/interceptor/headers";

// normalizeHeaders unifica os headers de uma requisição fetch (Request e/ou init) num
// Record<string,string> com chaves MINÚSCULAS — base do harvest da assinatura L3.

describe("normalizeHeaders", () => {
  test("lê init.headers como Record e baixa as chaves", () => {
    const out = normalizeHeaders("https://x.test", { headers: { "Csrf-Token": "ajax:1" } });
    expect(out["csrf-token"]).toBe("ajax:1");
  });

  test("lê init.headers como instância Headers", () => {
    const headers = new Headers({ "x-li-track": '{"clientVersion":"0.2.5844"}' });
    const out = normalizeHeaders("https://x.test", { headers });
    expect(out["x-li-track"]).toBe('{"clientVersion":"0.2.5844"}');
  });

  test("lê init.headers como array de pares", () => {
    const out = normalizeHeaders("https://x.test", { headers: [["CSRF-TOKEN", "ajax:2"]] });
    expect(out["csrf-token"]).toBe("ajax:2");
  });

  test("lê headers do próprio Request quando o recurso é um Request", () => {
    const req = new Request("https://x.test", { headers: { "csrf-token": "ajax:req" } });
    const out = normalizeHeaders(req);
    expect(out["csrf-token"]).toBe("ajax:req");
  });

  test("init vence o Request em colisão de chave", () => {
    const req = new Request("https://x.test", { headers: { "csrf-token": "do-request" } });
    const out = normalizeHeaders(req, { headers: { "csrf-token": "do-init" } });
    expect(out["csrf-token"]).toBe("do-init");
  });

  test("sem headers → objeto vazio, sem throw", () => {
    expect(normalizeHeaders("https://x.test")).toEqual({});
    expect(normalizeHeaders("https://x.test", null)).toEqual({});
  });
});
