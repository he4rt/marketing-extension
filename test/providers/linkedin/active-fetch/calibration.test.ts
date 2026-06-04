import { beforeEach, describe, expect, test } from "bun:test";
import {
  emptyCalibration,
  getCalibration,
  harvestSignature,
  isCalibrated,
  resetCalibration,
} from "../../../../src/providers/linkedin/active-fetch/calibration";

// URLs Voyager reais (mesmas shapes das fixtures de captura passiva).
const REACTIONS_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashReactions.aaa&variables=(count:10,start:0,urn:urn:li:activity:111)";
const COMMENTS_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashComments.bbb&variables=(count:10,start:0,socialDetailUrn:urn:li:fsd_socialDetail:urn:li:activity:111)";
const RESHARE_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerFeedDashReshareFeed.ccc&variables=(count:10,start:0,targetUrn:urn:li:share:111)";

describe("calibration (cache em memória + harvestSignature)", () => {
  beforeEach(() => resetCalibration());

  test("emptyCalibration nasce com tudo null", () => {
    const c = emptyCalibration();
    expect(c.queryId_reactions).toBeNull();
    expect(c.queryId_comments).toBeNull();
    expect(c.queryId_reposts).toBeNull();
    expect(c.clientVersion).toBeNull();
    expect(c.csrfToken).toBeNull();
    expect(c.lastUpdated).toBeNull();
  });

  test("isCalibrated é false sem nenhum queryId colhido", () => {
    expect(isCalibrated(emptyCalibration())).toBe(false);
  });

  test("isCalibrated é true quando ao menos UM queryId foi colhido", () => {
    expect(
      isCalibrated({ ...emptyCalibration(), queryId_reactions: "voyagerSocialDashReactions.aaa" }),
    ).toBe(true);
  });

  test("harvest de reactions extrai o queryId completo da URL", () => {
    harvestSignature(REACTIONS_URL);
    expect(getCalibration().queryId_reactions).toBe("voyagerSocialDashReactions.aaa");
  });

  test("harvest de comments extrai o queryId completo da URL", () => {
    harvestSignature(COMMENTS_URL);
    expect(getCalibration().queryId_comments).toBe("voyagerSocialDashComments.bbb");
  });

  test("harvest de reshareFeed extrai o queryId completo da URL", () => {
    harvestSignature(RESHARE_URL);
    expect(getCalibration().queryId_reposts).toBe("voyagerFeedDashReshareFeed.ccc");
  });

  test("harvest atualiza o singleton e marca lastUpdated (ISO)", () => {
    expect(getCalibration().lastUpdated).toBeNull();
    harvestSignature(REACTIONS_URL);
    const ts = getCalibration().lastUpdated;
    expect(ts).not.toBeNull();
    expect(Number.isNaN(Date.parse(ts as string))).toBe(false);
  });

  test("harvest acumula assinaturas de endpoints diferentes", () => {
    harvestSignature(REACTIONS_URL);
    harvestSignature(COMMENTS_URL);
    harvestSignature(RESHARE_URL);
    const c = getCalibration();
    expect(c.queryId_reactions).toBe("voyagerSocialDashReactions.aaa");
    expect(c.queryId_comments).toBe("voyagerSocialDashComments.bbb");
    expect(c.queryId_reposts).toBe("voyagerFeedDashReshareFeed.ccc");
  });

  test("harvest colhe clientVersion do header x-li-track quando presente", () => {
    harvestSignature(REACTIONS_URL, {
      "x-li-track": '{"clientVersion":"1.13.9999","mpVersion":"1.13.9999"}',
    });
    expect(getCalibration().clientVersion).toBe("1.13.9999");
  });

  test("harvest aceita mobileappVersion como fallback de clientVersion", () => {
    harvestSignature(REACTIONS_URL, {
      "x-li-track": '{"mobileappVersion":"2.0.1"}',
    });
    expect(getCalibration().clientVersion).toBe("2.0.1");
  });

  test("harvest colhe csrf-token do header explícito (já é o JSESSIONID sem aspas)", () => {
    harvestSignature(REACTIONS_URL, { "csrf-token": "ajax:1234567890" });
    expect(getCalibration().csrfToken).toBe("ajax:1234567890");
  });

  test("harvest NUNCA lança em URL malformada", () => {
    expect(() => harvestSignature("not a url")).not.toThrow();
    expect(() => harvestSignature("")).not.toThrow();
    expect(isCalibrated(getCalibration())).toBe(false);
  });

  test("harvest ignora URLs Voyager sem queryId conhecido (prefixo desconhecido)", () => {
    harvestSignature(
      "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerOutroEndpoint.zzz&variables=()",
    );
    const c = getCalibration();
    expect(c.queryId_reactions).toBeNull();
    expect(c.queryId_comments).toBeNull();
    expect(c.queryId_reposts).toBeNull();
  });

  test("getCalibration devolve sempre o mesmo singleton vivo", () => {
    harvestSignature(REACTIONS_URL);
    expect(getCalibration()).toBe(getCalibration());
  });
});
