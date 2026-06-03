import { describe, expect, test } from "bun:test";
import { createStore } from "../src/background/controller";
import { recordProvenance } from "../src/background/store";
import { publicationKey } from "../src/providers/shared/utils";

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
