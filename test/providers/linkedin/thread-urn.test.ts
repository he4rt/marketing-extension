import { describe, expect, test } from "bun:test";
import { extractUgcPost } from "../../../src/providers/linkedin/shared/thread-urn";

// extractUgcPost lê o ugcPost INLINE de um nó de post da busca SDUI. Inputs = recortes
// FIÉIS da captura ao vivo (#laraveldaysp, 2026-06-05). Par real he4rt (ORG):
//   activity 7457926735343390720 → ugcPost 7457926687662456833.

const ORG_NODE =
  '...,"url":"https://www.linkedin.com/company/he4rt/posts/",...,"postThreadUrn":' +
  '{"threadUrnUgcPostThreadUrn":{"__typename":"proto_com_linkedin_common_UserGeneratedContentPostUrn",' +
  '"userGeneratedContentPostUrn":{"userGeneratedContentId":"7457926687662456833"}}},...,' +
  '"updateUrnLegacy":"urn:li:fsd_update:(urn:li:activity:7457926735343390720,MAIN_FEED,DEBUG_REASON,DEFAULT,false)"';

describe("extractUgcPost — ugcPost INLINE do nó SDUI", () => {
  test("primário: userGeneratedContentId do postThreadUrn", () => {
    expect(extractUgcPost(ORG_NODE)).toBe("7457926687662456833");
  });

  test("primário tolera o id escapado no stream Flight", () => {
    const escaped =
      '\\"userGeneratedContentPostUrn\\":{\\"userGeneratedContentId\\":\\"7457926687662456833\\"}';
    expect(extractUgcPost(escaped)).toBe("7457926687662456833");
  });

  test("fallback: ugcPost embutido na URL canônica /posts/...-ugcPost-<id>-", () => {
    const urlNode =
      '"url":"https://www.linkedin.com/posts/he4rt_algo-ugcPost-7457926687662456833-aBcD/"';
    expect(extractUgcPost(urlNode)).toBe("7457926687662456833");
  });

  test("ausente → null (nó antigo sem postThreadUrn nem URL ugcPost)", () => {
    expect(
      extractUgcPost('{"controlName":"feed-actor","update":"urn:li:activity:9001"}'),
    ).toBeNull();
    expect(extractUgcPost("")).toBeNull();
  });
});
