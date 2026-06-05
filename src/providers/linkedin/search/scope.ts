import type { ScopeMode } from "../../contract";

// ScopeMode "search" do LinkedIn (#16, spec Passo 5).
//
// Ao contrário do modo "profile" — que filtra por substring do nome da organização —,
// o modo "search" NÃO re-filtra nada no cliente: o LinkedIn já aplicou a busca no
// servidor (SRP — Search Results Page). Logo, tudo que chega por uma captura
// `searchResultsContent` é, por definição, in-scope. É o YAGNI explícito da spec
// (não-objetivo: "re-filtrar a busca por palavra-chave no cliente").
//
// - detectFromPage: lê o parâmetro `?keywords=` da URL do SRP e devolve a query
//   (decodificada). Ausente → null (não é uma página de busca rastreável).
// - selects: sempre true (ver acima).
export const searchScopeMode: ScopeMode = {
  id: "search",
  label: "Search",
  // O LinkedIn já filtrou no servidor; tudo que chega por uma captura de busca é in-scope.
  detectFromPage: (pageUrl) => new URL(pageUrl).searchParams.get("keywords"),
  selects: () => true,
};
