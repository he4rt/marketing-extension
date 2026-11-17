// Classificação do AUTOR de um post da busca SDUI: membro (/in/) vs organização
// (/company/ ou /school/). PURO e DEFENSIVO: não toca chrome.*, nunca lança.
//
// Sinal de classificação (capturado ao vivo): o `feed-actor` carrega um NavigateToUrl
// (proto.sdui.actions.core.NavigateToUrl) cujo `url` aponta para o PERFIL do autor:
//   - https://www.linkedin.com/in/<vanity>/        → membro
//   - https://www.linkedin.com/company/<vanity>/   → organização
//   - https://www.linkedin.com/school/<vanity>/    → organização
//
// O BUG que isto corrige: o parser atual FABRICA um urn-slug a partir do nome de
// exibição (ex.: "heart_developers"). O vanity REAL ("he4rt") vem deste link de NAV.
//
// ANTI-HIJACK: o chamador passa a substring do NÓ do post (não o stream inteiro), para
// que um link /company/ no CORPO de um post de membro não sequestre a classificação.
// Limitação (heurística): casamos o PRIMEIRO link de perfil do nó; assume-se que o
// cabeçalho `feed-actor` (e portanto o NAV do autor) precede o corpo no mesmo nó.

export type AuthorKind = { kind: "member" | "organization"; vanity: string };

// Primeiro link de perfil do nó: /in/, /company/ ou /school/ seguido do vanity.
// O vanity aceita letras, números, hífen e percent-encoding (vanitys já vêm encodados).
const PROFILE_NAV = /linkedin\.com\/(in|company|school)\/([A-Za-z0-9\-%._]+)/;

export function classifyAuthorNav(rawNode: string): AuthorKind | null {
  if (typeof rawNode !== "string" || rawNode.length === 0) return null;

  const match = PROFILE_NAV.exec(rawNode);
  if (!match) return null;

  const segment = match[1];
  const vanity = match[2];
  if (!vanity) return null;

  const isOrganization = segment === "company" || segment === "school";
  return { kind: isOrganization ? "organization" : "member", vanity };
}
