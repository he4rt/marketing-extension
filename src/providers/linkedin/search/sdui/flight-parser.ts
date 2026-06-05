// Tokenizer do stream React-Flight da busca SDUI do LinkedIn.
//
// O corpo de `/flagship-web/search/results/content` é um stream "Flight": uma sequência
// de linhas no formato `HEX_ID:conteúdo`, onde o conteúdo costuma ser JSON. Componentes
// referenciam outras linhas de forma preguiçosa via refs `$L<hex>` (lazy) — p.ex. o texto
// de um post chega como `"children":"$L40"`, apontando para a linha de id `40`.
//
// Este módulo é PURO e DEFENSIVO: quebra o stream em linhas, indexa por id e oferece um
// resolvedor de refs. Linha sem `:` é ignorada; ref inexistente devolve null. Nunca lança.

// Tabela de linhas + resolvedor de refs do stream Flight.
export type FlightTables = {
  // hex_id → conteúdo cru daquela linha (tudo após o primeiro ':').
  byId: Map<string, string>;
  // Resolve uma ref ("$L<hex>", "$<hex>" ou o hex puro) para o conteúdo da linha-alvo.
  // null se a ref não casar com nenhuma linha conhecida.
  resolveRef: (ref: string) => string | null;
};

// Linha do Flight: id em hex (comprimento variável) seguido de ':' e do conteúdo.
// O hex é "preguiçoso" no início (1ª ocorrência de ':'), pois o conteúdo JSON também
// tem ':' — por isso casamos só o prefixo hex e fatiamos manualmente o resto.
const FLIGHT_LINE = /^([0-9a-f]+):/;

// Normaliza qualquer forma de ref para o id hex puro da linha-alvo.
//  - "$L40" → "40"   (ref lazy de componente)
//  - "$40"  → "40"   (ref direta)
//  - "40"   → "40"   (já é o id)
// Qualquer outra coisa → null (não é uma ref resolvível).
function refToId(ref: string): string | null {
  if (typeof ref !== "string" || ref.length === 0) return null;
  if (ref.startsWith("$L")) return ref.slice(2) || null;
  if (ref.startsWith("$")) {
    const id = ref.slice(1);
    // "$" sozinho ou "$react.fragment" etc. não são refs de linha.
    return /^[0-9a-f]+$/.test(id) ? id : null;
  }
  return /^[0-9a-f]+$/.test(ref) ? ref : null;
}

// Quebra o stream em linhas id→conteúdo e monta as tabelas. Defensivo:
//  - raw vazio/whitespace → tabelas vazias (resolveRef sempre null).
//  - linha sem ':' ou sem prefixo hex válido → ignorada.
//  - ids duplicados → a primeira ocorrência vence (estável e previsível).
export function tokenizeFlight(raw: string): FlightTables {
  const byId = new Map<string, string>();

  if (typeof raw === "string" && raw.length > 0) {
    for (const line of raw.split("\n")) {
      const m = FLIGHT_LINE.exec(line);
      if (!m?.[1]) continue;
      const id = m[1];
      if (byId.has(id)) continue;
      // Conteúdo é tudo após o ':' do prefixo (m[0] inclui o ':').
      byId.set(id, line.slice(m[0].length));
    }
  }

  const resolveRef = (ref: string): string | null => {
    const id = refToId(ref);
    if (id === null) return null;
    return byId.has(id) ? (byId.get(id) as string) : null;
  };

  return { byId, resolveRef };
}
