import { describe, expect, test } from "bun:test";
import { linkedinNetworkIntercept } from "../../../src/providers/linkedin/capture";

// Step 1/2 (revisado): o match() do LinkedIn NÃO harvesta (ele roda no MAIN, contexto
// separado do SW). Ele apenas RETORNA a assinatura a encaminhar — só x-li-track (clientVersion).
// O csrf NUNCA entra na signature (o SW o lê do cookie). O harvest de fato vive no SW
// (processLinkedInCapture) e é coberto em providers/linkedin/sw-harvest.test.ts.

// Voyager endpoint extraction depende de window.location (ausente no bun test); o caso
// Voyager do harvest é coberto em sw-harvest.test.ts. Aqui focamos no forwarding da signature.
const SEARCH_URL = "https://www.linkedin.com/flagship-web/search/results/content/?keywords=Laravel";

describe("linkedinNetworkIntercept.match — assinatura encaminhada (Step 1/2)", () => {
  test("encaminha x-li-track na signature da captura de busca", () => {
    const match = linkedinNetworkIntercept.match(SEARCH_URL, {
      headers: {
        "csrf-token": "ajax:8505769847392528297",
        "x-li-track": '{"clientVersion":"0.2.5844"}',
      },
    });
    expect(match?.endpoint).toBe("searchResultsContent");
    expect(match?.signature).toEqual({ "x-li-track": '{"clientVersion":"0.2.5844"}' });
  });

  test("NUNCA encaminha o csrf na signature (vai pelo cookie no SW)", () => {
    const match = linkedinNetworkIntercept.match(SEARCH_URL, {
      headers: { "csrf-token": "ajax:secreto" },
    });
    expect(match?.signature).toBeUndefined(); // só csrf presente → nada a encaminhar
  });

  test("sem headers → signature undefined, endpoint preservado", () => {
    const match = linkedinNetworkIntercept.match(SEARCH_URL, null);
    expect(match?.endpoint).toBe("searchResultsContent");
    expect(match?.signature).toBeUndefined();
  });
});
