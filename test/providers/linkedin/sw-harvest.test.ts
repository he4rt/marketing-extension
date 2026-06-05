import { beforeEach, describe, expect, test } from "bun:test";
import { createStore, handleRuntimeMessage } from "../../../src/background/controller";
import { processLinkedInCapture } from "../../../src/providers/linkedin";
import {
  getCalibration,
  resetCalibration,
} from "../../../src/providers/linkedin/active-fetch/calibration";
import type { CapturedPayloadMessage } from "../../../src/shared/messages";

// GUARD anti-regressão do split MAIN↔SW (root cause #2): a calibração L3 é colhida NO SERVICE
// WORKER a partir das mensagens de captura — NÃO no MAIN (interceptor), que vive noutro realm.
// Se alguém voltar a harvestar só no MAIN, getCalibration() no SW fica vazio e estes testes
// quebram. queryId vem da URL; clientVersion vem da signature (x-li-track) encaminhada.

const REACTIONS_URL =
  "https://www.linkedin.com/voyager/api/graphql?queryId=voyagerSocialDashReactions.aaa&variables=(x)";

function voyagerCapture(over: Partial<CapturedPayloadMessage> = {}): CapturedPayloadMessage {
  return {
    action: "CAPTURED_PAYLOAD",
    provider: "linkedin",
    endpoint: "socialDashReactions",
    payload: {},
    url: REACTIONS_URL,
    timestamp: "2026-06-04T00:00:00.000Z",
    signature: { "x-li-track": '{"clientVersion":"0.2.5844"}' },
    ...over,
  };
}

describe("harvest L3 no service worker (guard do split MAIN↔SW)", () => {
  beforeEach(() => resetCalibration());

  test("processLinkedInCapture colhe queryId (URL) + clientVersion (signature)", () => {
    const store = createStore("");
    processLinkedInCapture(store, voyagerCapture());

    const calib = getCalibration();
    expect(calib.queryId_reactions).toBe("voyagerSocialDashReactions.aaa");
    expect(calib.clientVersion).toBe("0.2.5844");
  });

  test("cadeia completa: CAPTURED_PAYLOAD pelo controller calibra o SW", () => {
    const store = createStore("");
    handleRuntimeMessage(store, voyagerCapture(), {});
    // isCalibrated = tem ao menos um queryId → o botão L3 habilita a partir do SW.
    expect(getCalibration().queryId_reactions).toBe("voyagerSocialDashReactions.aaa");
  });

  test("captura sem signature ainda colhe o queryId da URL (clientVersion fica null)", () => {
    const store = createStore("");
    processLinkedInCapture(store, voyagerCapture({ signature: undefined }));

    const calib = getCalibration();
    expect(calib.queryId_reactions).toBe("voyagerSocialDashReactions.aaa");
    expect(calib.clientVersion).toBeNull();
  });
});
