import { describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../src/background/controller";
import { recordProvenance } from "../src/background/store";
import { publicationKey } from "../src/providers/shared/utils";
import type { BackgroundStore } from "../src/shared/domain";
import { instagramFeedPayload } from "./fixtures/instagram-payloads";
import { linkedinFeedPayload } from "./fixtures/linkedin-payloads";
import { userTweetsPayload } from "./fixtures/twitter-payloads";

// Mini-harness: envia mensagens ao controller com contexto no-op.
const sendTo = (store: BackgroundStore) => (req: any) =>
  handleRuntimeMessage(store, req, { log: () => {}, persistHandle: () => {} });

// Provenance do Scope (#9): mapa interno store.provenance — registra qual modo/valor de
// coleta trouxe cada publicação. NUNCA é exportado no v3 (o golden-master garante isso
// nos testes por-provider abaixo, conforme cada captura passa a gravar a Provenance).

describe("scope provenance (#9) — infra do mapa interno", () => {
  test("createStore inicializa provenance vazio", () => {
    const store = createStore();
    expect(store.provenance).toEqual({});
  });

  test("recordProvenance grava por publicationKey(provider, id)", () => {
    const store = createStore();
    recordProvenance(store, "x", "123", "profile", "He4rtDevs");
    expect(store.provenance.x?.[publicationKey("x", "123")]).toEqual({
      mode: "profile",
      value: "He4rtDevs",
    });
  });

  test("recordProvenance acumula entradas independentes por provider", () => {
    const store = createStore();
    recordProvenance(store, "x", "1", "profile", "He4rtDevs");
    recordProvenance(store, "instagram", "2", "profile", "he4rtdevs");
    expect(Object.keys(store.provenance.x ?? {})).toHaveLength(1);
    expect(store.provenance.instagram?.[publicationKey("instagram", "2")]?.value).toBe("he4rtdevs");
  });
});

describe("scope provenance (#9) — gravada na captura", () => {
  test("X: capturar UserTweets do perfil rastreado grava {mode:profile, value:handle}", () => {
    const store = createStore();
    const send = sendTo(store);
    send({ action: "SET_HANDLE", handle: "He4rtDevs" });
    send({
      action: "CAPTURED_PAYLOAD",
      provider: "x",
      endpoint: "UserTweets",
      payload: userTweetsPayload,
      timestamp: "2026-05-20T12:00:00.000Z",
      pageUrl: "https://x.com/He4rtDevs",
    });
    const entries = store.provenance.x ?? {};
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    for (const p of Object.values(entries)) {
      expect(p).toEqual({ mode: "profile", value: "He4rtDevs" });
    }
  });

  test("Instagram: capturar feed do perfil rastreado grava Provenance", () => {
    const store = createStore();
    const send = sendTo(store);
    send({ action: "SET_HANDLE", handle: "he4rtdevs" });
    send({
      action: "CAPTURED_PAYLOAD",
      provider: "instagram",
      endpoint: "InstagramFeedTimeline",
      payload: instagramFeedPayload,
      timestamp: "2026-05-20T13:00:00.000Z",
      pageUrl: "https://www.instagram.com/",
    });
    const entries = store.provenance.instagram ?? {};
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    for (const p of Object.values(entries)) {
      expect(p).toEqual({ mode: "profile", value: "he4rtdevs" });
    }
  });

  test("Provenance NUNCA vaza no export v3 (sem scope_mode/scope_value no JSON)", () => {
    const store = createStore();
    const send = sendTo(store);
    send({ action: "SET_HANDLE", handle: "he4rtdevs" });
    send({
      action: "CAPTURED_PAYLOAD",
      provider: "instagram",
      endpoint: "InstagramFeedTimeline",
      payload: instagramFeedPayload,
      timestamp: "2026-05-20T13:00:00.000Z",
      pageUrl: "https://www.instagram.com/",
    });
    const json = JSON.stringify(send({ action: "GET_EXPORT" }));
    expect(json).not.toContain("scope_mode");
    expect(json).not.toContain("scope_value");
  });

  test("LinkedIn: capturar feed do perfil rastreado grava Provenance", () => {
    const store = createStore();
    const send = sendTo(store);
    send({ action: "SET_HANDLE", handle: "He4rt Developers", provider: "linkedin" });
    send({
      action: "CAPTURED_PAYLOAD",
      provider: "linkedin",
      endpoint: "feedDashOrganizationalPageUpdates",
      payload: linkedinFeedPayload,
      timestamp: "2026-05-20T14:00:00.000Z",
      pageUrl: "https://www.linkedin.com/company/he4rt/",
    });
    const entries = store.provenance.linkedin ?? {};
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    for (const p of Object.values(entries)) {
      expect(p).toEqual({ mode: "profile", value: "He4rt Developers" });
    }
  });
});

describe("scope collection target (#9) — DETECT_TARGET", () => {
  test("detecta o alvo da URL de um perfil (X)", () => {
    const res = sendTo(createStore())({
      action: "DETECT_TARGET",
      provider: "x",
      pageUrl: "https://x.com/He4rtDevs",
    });
    expect(res).toEqual({ mode: "profile", target: "He4rtDevs" });
  });

  test("retorna target null em URL que não é perfil (Instagram)", () => {
    const res = sendTo(createStore())({
      action: "DETECT_TARGET",
      provider: "instagram",
      pageUrl: "https://www.instagram.com/p/ABC123/",
    });
    expect(res).toEqual({ mode: "profile", target: null });
  });
});
