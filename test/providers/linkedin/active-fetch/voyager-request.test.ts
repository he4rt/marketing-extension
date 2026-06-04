import { describe, expect, test } from "bun:test";
import type { CalibrationCache } from "../../../../src/providers/linkedin/active-fetch/calibration";
import { emptyCalibration } from "../../../../src/providers/linkedin/active-fetch/calibration";
import { buildVoyagerRequest } from "../../../../src/providers/linkedin/active-fetch/voyager-request";

const TARGET = { id: "urn:li:activity:111", activityUrn: "urn:li:activity:111" };

function fullCalibration(): CalibrationCache {
  return {
    queryId_reactions: "voyagerSocialDashReactions.aaa",
    queryId_comments: "voyagerSocialDashComments.bbb",
    queryId_reposts: "voyagerFeedDashReshareFeed.ccc",
    clientVersion: "1.13.9999",
    csrfToken: "ajax:1234567890",
    lastUpdated: new Date().toISOString(),
  };
}

describe("buildVoyagerRequest (replay autenticado por assinatura colhida)", () => {
  test("sem calibração do endpoint → null (endpoint pulado)", () => {
    expect(buildVoyagerRequest(TARGET, "socialDashReactions", emptyCalibration())).toBeNull();
  });

  test("calibrado parcialmente: pula o endpoint sem queryId, monta os calibrados", () => {
    const calib = {
      ...emptyCalibration(),
      queryId_reactions: "voyagerSocialDashReactions.aaa",
      csrfToken: "ajax:1",
    };
    expect(buildVoyagerRequest(TARGET, "socialDashReactions", calib)).not.toBeNull();
    expect(buildVoyagerRequest(TARGET, "socialDashComments", calib)).toBeNull();
    expect(buildVoyagerRequest(TARGET, "feedDashReshareFeed", calib)).toBeNull();
  });

  test("endpoint lógico desconhecido → null", () => {
    // @ts-expect-error endpoint fora da união, testando robustez
    expect(buildVoyagerRequest(TARGET, "naoExiste", fullCalibration())).toBeNull();
  });

  test("monta GET para /voyager/api/graphql com o queryId colhido (reactions)", () => {
    const req = buildVoyagerRequest(TARGET, "socialDashReactions", fullCalibration());
    expect(req).not.toBeNull();
    expect(req?.method).toBe("GET");
    const u = new URL(req!.url);
    expect(u.pathname).toBe("/voyager/api/graphql");
    expect(u.searchParams.get("queryId")).toBe("voyagerSocialDashReactions.aaa");
  });

  test("variables de reactions carrega a URN da atividade (parser casa /urn:li:activity:\\d+/)", () => {
    const req = buildVoyagerRequest(TARGET, "socialDashReactions", fullCalibration());
    const vars = new URL(req!.url).searchParams.get("variables") || "";
    expect(vars).toContain("urn:li:activity:111");
  });

  test("variables de comments carrega a URN da atividade", () => {
    const req = buildVoyagerRequest(TARGET, "socialDashComments", fullCalibration());
    expect(new URL(req!.url).searchParams.get("queryId")).toBe("voyagerSocialDashComments.bbb");
    expect(new URL(req!.url).searchParams.get("variables") || "").toContain("urn:li:activity:111");
  });

  test("variables de reposts carrega targetUrn (parser casa targetUrn:<urn>)", () => {
    const req = buildVoyagerRequest(TARGET, "feedDashReshareFeed", fullCalibration());
    expect(new URL(req!.url).searchParams.get("queryId")).toBe("voyagerFeedDashReshareFeed.ccc");
    expect(new URL(req!.url).searchParams.get("variables") || "").toContain(
      "targetUrn:urn:li:activity:111",
    );
  });

  test("auth: credentials include + headers de replay do Voyager", () => {
    const req = buildVoyagerRequest(TARGET, "socialDashReactions", fullCalibration());
    expect(req?.credentials).toBe("include");
    expect(req?.headers.get("csrf-token")).toBe("ajax:1234567890");
    expect(req?.headers.get("x-restli-protocol-version")).toBe("2.0.0");
    expect(req?.headers.get("accept")).toBe("application/vnd.linkedin.normalized+json+2.1");
  });

  test("x-li-track usa o clientVersion colhido quando presente", () => {
    const req = buildVoyagerRequest(TARGET, "socialDashReactions", fullCalibration());
    const track = req?.headers.get("x-li-track") || "";
    expect(track).toContain("1.13.9999");
  });

  test("sem csrfToken colhido → null (replay não autenticável)", () => {
    const calib = { ...fullCalibration(), csrfToken: null };
    expect(buildVoyagerRequest(TARGET, "socialDashReactions", calib)).toBeNull();
  });

  test("sem clientVersion: ainda monta o request, omitindo x-li-track", () => {
    const calib = { ...fullCalibration(), clientVersion: null };
    const req = buildVoyagerRequest(TARGET, "socialDashReactions", calib);
    expect(req).not.toBeNull();
    expect(req?.headers.get("x-li-track")).toBeNull();
  });
});
