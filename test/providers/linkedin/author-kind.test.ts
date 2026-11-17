import { describe, expect, test } from "bun:test";
import { classifyAuthorNav } from "../../../src/providers/linkedin/shared/author-kind";

// classifyAuthorNav lê o NavigateToUrl do feed-actor e classifica o autor do post como
// membro (/in/) ou organização (/company/ ou /school/), extraindo o vanity REAL do path.
// Inputs = recortes FIÉIS da captura ao vivo (#laraveldaysp, 2026-06-05).

describe("classifyAuthorNav — member vs organization", () => {
  test("/company/he4rt → organização com vanity 'he4rt' (corrige o slug fabricado)", () => {
    const orgNode =
      '...,"url":"https://www.linkedin.com/company/he4rt/posts/",...,"feed-actor":true';
    expect(classifyAuthorNav(orgNode)).toEqual({ kind: "organization", vanity: "he4rt" });
  });

  test("/school/<vanity> também é organização", () => {
    const schoolNode = '"url":"https://www.linkedin.com/school/usp/posts/"';
    expect(classifyAuthorNav(schoolNode)).toEqual({ kind: "organization", vanity: "usp" });
  });

  test("/in/caio-barilli → membro com vanity 'caio-barilli'", () => {
    const memberNode = "https://www.linkedin.com/in/caio-barilli/";
    expect(classifyAuthorNav(memberNode)).toEqual({ kind: "member", vanity: "caio-barilli" });
  });

  test("sem link de perfil → null (cabeçalho sem NAV de autor)", () => {
    expect(classifyAuthorNav('{"controlName":"feed-actor"}')).toBeNull();
    expect(classifyAuthorNav("")).toBeNull();
  });

  // ANTI-HIJACK: o classifier casa o PRIMEIRO link de perfil do nó. Como o chamador passa
  // a substring do NÓ do post (o cabeçalho feed-actor, onde o NAV do AUTOR aparece antes
  // do corpo), um /company/ no corpo de um post de membro não sequestra a classificação:
  // o NAV /in/ do autor vem primeiro. Limitação documentada: a precedência é posicional.
  test("anti-hijack: NAV do autor (/in/) antes de um /company/ no corpo → classifica como membro", () => {
    const memberWithOrgLinkInBody =
      'feed-actor ... "url":"https://www.linkedin.com/in/ana-dev/" ...' +
      ' commentary ... "https://www.linkedin.com/company/acme/" mencionada no texto';
    expect(classifyAuthorNav(memberWithOrgLinkInBody)).toEqual({
      kind: "member",
      vanity: "ana-dev",
    });
  });
});
