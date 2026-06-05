# Spec — LinkedIn Search Scope (L3): descoberta SDUI + aprofundamento por Active Fetch

> Data: 2026-06-03 · Branch: `feat/linkedin-search` · ADR: [0004](../adr/0004-linkedin-search-scope-active-fetch.md)
> (estende [ADR-0003](../adr/0003-active-fetch-provider-devto.md), dependência pendente)
>
> ⚠️ **Atualização 2026-06-05:** o replay do L3 foi validado ao vivo e descobriu-se que
> reactions/comments/reposts **exigem o `ugcPost`** (o `activity` dá 200 vazio) — precisa de um
> estágio de **resolve** `activity→ugcPost`. Detalhes, mapa campo→fonte e plano de implementação
> em **[findings 2026-06-05](2026-06-05-l3-replay-findings.md)**.

## Objetivo

Medir o **alcance de um evento/tema** no LinkedIn (ex.: busca `"Laravel Day SP"`) capturando, em
nível **L3**, **pessoas + números + comentários** dos posts que casam a query: autores, contadores
de engajamento, comentaristas (com texto), e quem reagiu/repostou. Carimba cada item com
**Provenance** `{mode:"search", value:"<query>"}` no export v3.

## Não-objetivos (YAGNI)

- Bump para `schema_version: 4` (sem Hub que consuma; provenance entra aditiva no v3).
- Multi-tenant / "todos os membros" (single-tenant: o usuário logado).
- AFK / coleta em background (aprofundamento é on-demand, session-based).
- Re-filtrar a busca por palavra-chave no cliente (o LinkedIn já filtrou no servidor).

---

## Arquitetura — dois estágios

```
 ESTÁGIO 1 — DESCOBERTA (Passive Capture, content script)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ USER busca "Laravel Day SP"                                                 │
 │  content: detectFromPage(?keywords=) → Collection Target                    │
 │           {linkedin, search, "Laravel Day SP"}                             │
 │  interceptor (MAIN): match() casa /flagship-web/search/results/content      │
 │           → { endpoint:"searchResultsContent", responseFormat:"text" }      │
 │           → clone.text() (NÃO json) → SOCIAL_CAPTURED (payload: string)      │
 │  parser SDUI (defensivo): Flight → [{activity_urn, autor, texto, 42/7/3}]    │
 │           shape desconhecido → pula + conta "ilegíveis"                      │
 │  processCapture → store.platforms.linkedin + provenance[urn]={search,...}    │
 └───────────────────────────────────────────────────────────────────────────┘
 ESTÁGIO 2 — APROFUNDAMENTO L3 (Active Fetch, background, botão)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ USER 👆 popup "Aprofundar engajamento (L3)"                                 │
 │  background scheduler: fan-out sequencial (delay) sobre os URNs do store:    │
 │    GET voyager/api/graphql?queryId=voyagerSocialDashReactions.<hash>...      │
 │    GET voyager/api/graphql?queryId=voyagerSocialDashComments.<hash>...       │
 │    GET voyager/api/graphql?queryId=voyagerFeedDashReshareFeed.<hash>...      │
 │  auth: credentials:"include" + csrf-token(=JSESSIONID) + x-restli +          │
 │        accept(normalized) + x-li-track/queryId COLHIDOS do tráfego passivo   │
 │  → MESMO processCapture → Actors/Comments/Engagements + provenance           │
 └───────────────────────────────────────────────────────────────────────────┘
 EXPORT v3: cada item ganha provenance{mode,value} SÓ quando presente.
            snapshots profile-puro byte-idênticos · snapshot novo pra busca.
```

**Fluxo no popup (USER ⇄ SYSTEM):**

```
 USER                                   SYSTEM
  │  🔎 busca "Laravel Day SP"           │
  │ ────────────────────────────────────►│ content: SET Collection Target {search}
  │                                      │ interceptor: capta SDUI (text)
  │                                      │ parser: 23 posts · 2 ilegíveis (drift)
  │   "23 posts · 2 ilegíveis            │
  │    sobre 'Laravel Day SP'"           │
  │ ◄────────────────────────────────────│
  │   ┌──────────────────────────────┐   │
  │   │ Aprofundar engajamento (L3)  │   │  (desabilitado se não calibrado:
  │   │ Exportar JSON                │   │   "abra um post uma vez pra calibrar")
  │   └──────────────────────────────┘   │
  │  👆 "Aprofundar engajamento (L3)"    │
  │ ────────────────────────────────────►│ background: Active Fetch fan-out
  │                                      │ scheduler: 23 URNs × 3 endpoints, delay
  │   "Aprofundado 23/23 · 612 Actors"   │
  │ ◄────────────────────────────────────│
```

---

## Passos de implementação

Cada passo segue: **Contexto** → **Antes/Depois** → **BDD (given/then)**.

### Passo 1 — `NetworkMatch` ganha `responseFormat` (camada genérica)

**Contexto.** O interceptor (`src/interceptor/index.ts`) faz `clone.json()` em toda resposta
(linha 83). A busca SDUI é `octet-stream` num stream React-Flight, **não JSON** → `.json()` estoura
e o payload é descartado. Para a descoberta funcionar, a estratégia precisa declarar que aquela URL
devolve **texto**. Mantém o interceptor genérico: ele só respeita um hint, não conhece redes.
Afeta `src/capture/strategies.ts` (`NetworkMatch`).

**Antes/Depois** (`src/capture/strategies.ts`):

```ts
// ANTES
export type NetworkMatch = {
  endpoint: string;
};

// DEPOIS
export type NetworkMatch = {
  endpoint: string;
  // Como o interceptor deve ler o corpo da resposta. Default "json" (clone.json()).
  // "text" (clone.text()) para respostas não-JSON, ex.: o stream SDUI/Flight da busca do LinkedIn.
  responseFormat?: "json" | "text";
};
```

**BDD:**
- **Given** uma estratégia cujo `match()` retorna `{ endpoint, responseFormat: "text" }`,
  **then** o interceptor lê `clone.text()` e posta a string crua como payload.
- **Given** um `match()` que retorna `{ endpoint }` (sem `responseFormat`),
  **then** o comportamento é idêntico ao atual (`clone.json()`) — retrocompatível.

### Passo 2 — Interceptor honra `responseFormat`

**Contexto.** Consumir o hint do Passo 1 no patch de `fetch` (e XHR) sem quebrar o caminho JSON
existente de X/Instagram/LinkedIn-Voyager. Afeta `src/interceptor/index.ts` (linhas 80–88 no fetch;
137–153 no XHR).

**Antes/Depois** (`src/interceptor/index.ts`, ramo `fetch`):

```ts
// ANTES
return originalFetch.apply(this, args).then(async (response) => {
  try {
    const clone = response.clone();
    const data = await clone.json();
    emitFromPayload(resolved, endpoint, url, data);
  } catch {}
  return response;
});

// DEPOIS
return originalFetch.apply(this, args).then(async (response) => {
  try {
    const clone = response.clone();
    const data = match.responseFormat === "text" ? await clone.text() : await clone.json();
    emitFromPayload(resolved, endpoint, url, data);
  } catch {}
  return response;
});
```

**BDD:**
- **Given** a resposta da busca (`octet-stream`, Flight), **when** capturada,
  **then** `payload` chega ao background como **string** (não objeto), pronta para o parser SDUI.
- **Given** uma resposta Voyager JSON (reactions/comments), **then** o caminho `json()` segue
  inalterado — **regressão zero** para a captura existente.
- **Given** uma resposta `text` que falha no parser, **then** o `try/catch` engole o erro e a
  resposta original do site **não é afetada** (clone isolado).

### Passo 3 — `capture.ts`: match da busca + harvest de assinaturas

**Contexto.** Hoje `linkedinNetworkIntercept.match` só casa `/voyager/api/graphql`
(`src/providers/linkedin/capture.ts`). Precisamos: (a) casar também
`/flagship-web/search/results/content` declarando `responseFormat:"text"`; (b) **colher** as
assinaturas voláteis (`queryId` de reactions/comments/reshare, `x-li-track` clientVersion) do
tráfego Voyager passivo, para o Active Fetch reusar (harvest-and-cache).

**Antes/Depois** (`src/providers/linkedin/capture.ts`):

```ts
// ANTES
export const linkedinNetworkIntercept: NetworkInterceptStrategy = {
  kind: "networkIntercept",
  match(url) {
    const endpoint = extractLinkedInEndpointName(url);
    return endpoint ? { endpoint } : null;
  },
};

// DEPOIS
const LINKEDIN_SEARCH_PATH = "/flagship-web/search/results/content";

export const linkedinNetworkIntercept: NetworkInterceptStrategy = {
  kind: "networkIntercept",
  match(url) {
    if (url.includes(LINKEDIN_SEARCH_PATH)) {
      return { endpoint: "searchResultsContent", responseFormat: "text" };
    }
    const endpoint = extractLinkedInEndpointName(url);
    if (!endpoint) return null;
    // Harvest: ao ver um queryId Voyager passivo, cacheia a assinatura para o Active Fetch.
    harvestVoyagerSignature(url); // grava queryId+clientVersion no cache de calibração
    return { endpoint };
  },
};
```

**BDD:**
- **Given** a navegação dispara `/flagship-web/search/results/content/?keywords=...`,
  **then** `match()` retorna `{ endpoint:"searchResultsContent", responseFormat:"text" }`.
- **Given** o usuário abre um post e o Voyager chama `voyagerSocialDashReactions.<hash>`,
  **then** a assinatura (`queryId`, `clientVersion`) é cacheada para calibração.
- **Given** nenhuma navegação Voyager de reactions ocorreu ainda,
  **then** o cache fica sem aquela assinatura → o Active Fetch dela fica **desabilitado** (Passo 7).

### Passo 4 — `parser.ts`: parser SDUI/Flight defensivo

**Contexto.** A resposta da busca é um stream React-Flight: linhas `id:valor`, componentes com refs
lazy `$L<id>`. Da `.har` real: `urn:li:activity:*` e `memberHeadline` vêm inline; o **texto do post**
é deferido (`"children":"$L40"`). O parser puro recebe a string crua e devolve
`SocialPublication[]` + contadores, resolvendo refs `$L`. **Defensivo:** item ilegível → pula e
incrementa contador, **nunca crasha**. É função pura, testável com fixture. Afeta
`src/providers/linkedin/parser.ts` (+ uma fixture em `test/fixtures/`).

**Forma (resumo):**

```ts
// NOVO em parser.ts
export type SduiSearchResult = {
  publications: SocialPublication[];
  unreadable: number; // itens cujo shape não foi reconhecido (drift)
};

export function parseLinkedInSearchSdui(raw: string): SduiSearchResult {
  // 1. quebra o Flight em linhas id→valor; monta tabela de refs $L
  // 2. acha nós de post (urn:li:activity); resolve autor (memberHeadline inline)
  //    e texto (via ref $L); lê contadores (ReactionType/numComments/reshares)
  // 3. shape inesperado → unreadable++ e segue
}
```

**BDD:**
- **Given** a fixture SDUI real da busca "Laravel Day SP",
  **then** `publications` tem os posts com `author.name`, `text` resolvido e `metrics` preenchidos.
- **Given** um nó de post com shape desconhecido (drift de `sdui_ver`),
  **then** ele NÃO entra em `publications`, `unreadable` incrementa, e o parser **não lança**.
- **Given** uma string vazia/truncada, **then** retorna `{ publications: [], unreadable: 0 }`.
- **Given** texto deferido cuja ref `$L` não resolve, **then** o post entra com `text: ""` (não
  descarta o post — autor/métricas ainda valem) e conta como parcial.

### Passo 5 — `index.ts`: scope `search`, `detectFromPage`, provenance

**Contexto.** Hoje `scopeModes` só tem `profile` (`src/providers/linkedin/index.ts:400`).
Adicionar o modo `search`: `detectFromPage` lê `?keywords=` da URL do SRP; `processCapture`
roteia o endpoint `searchResultsContent` para o parser SDUI e carimba a Provenance
`{mode:"search", value:<query>}` no mapa lateral por `publicationKey`.

**Antes/Depois** (`src/providers/linkedin/index.ts`):

```ts
// ANTES
export const scopeModes: ScopeMode[] = [
  {
    id: "profile",
    label: "Profile",
    selects: (pub, value) => pub.author.name?.toLowerCase().includes(value.toLowerCase()) ?? false,
  },
];

// DEPOIS
export const scopeModes: ScopeMode[] = [
  {
    id: "profile",
    label: "Profile",
    selects: (pub, value) => pub.author.name?.toLowerCase().includes(value.toLowerCase()) ?? false,
  },
  {
    id: "search",
    label: "Search",
    // O LinkedIn já filtrou no servidor; tudo que chega por uma captura de busca é in-scope.
    detectFromPage: (pageUrl) => new URL(pageUrl).searchParams.get("keywords"),
    selects: () => true,
  },
];
```

**BDD:**
- **Given** a URL `…/search/results/content/?keywords=Laravel+Day+SP`,
  **then** `detectFromPage` devolve `"Laravel Day SP"` e o Collection Target vira
  `{linkedin, search, "Laravel Day SP"}`.
- **Given** uma captura `searchResultsContent`, **then** cada publication recebe
  `provenance["urn"] = {mode:"search", value:"Laravel Day SP"}`.
- **Given** o usuário troca de query, **then** `reprocessPayloads` re-carimba a Provenance com o
  novo valor (filtro vive no `processCapture`, conforme o invariante de escopo).
- **Backward-compat:** **given** uma captura `profile` (Voyager BPR), **then** o caminho atual
  segue intacto — `search` é aditivo.

### Passo 6 — Seam **Active Fetch** (primeira implementação do ADR-0003)

**Contexto.** Não existe código de Active Fetch em nenhum branch — este passo o cria, contido,
seguindo o ADR-0003 e estendendo-o (auth por assinatura colhida; enumeração a partir do store).
Novos arquivos: `src/capture/active-fetch.ts` (tipos), `src/background/active-fetch.ts` (scheduler),
registro paralelo a `BACKGROUND_PROVIDERS`. O LinkedIn declara a faceta `activeFetch`.

**Forma (resumo):**

```ts
// src/capture/active-fetch.ts (NOVO)
export type ActiveFetchTarget = { id: string; url: string }; // ex.: por activity_urn
export type ActiveFetchFacet = {
  id: SocialProvider;
  // Enumera alvos a partir do store (LinkedIn: os activity_urn descobertos na busca).
  enumerate: (store: BackgroundStore) => ActiveFetchTarget[];
  // Monta o request (GET) com auth por assinatura colhida; null se não calibrado.
  buildRequest: (target: ActiveFetchTarget, calib: CalibrationCache) => Request | null;
  // Endpoint lógico para o processCapture rotear o payload.
  endpointFor: (target: ActiveFetchTarget) => string;
};

// src/background/active-fetch.ts (NOVO)
// runActiveFetch(provider, store): fan-out SEQUENCIAL com delay; cada resposta vira
// um envelope sintético → MESMO processCapture(store, capture). Sem AFK.
```

Auth do LinkedIn (`buildRequest`): `credentials:"include"` + headers
`csrf-token` (= cookie `JSESSIONID`), `x-restli-protocol-version: 2.0.0`,
`accept: application/vnd.linkedin.normalized+json+2.1`, `x-li-track` (colhido). `queryId` colhido.

**BDD:**
- **Given** 23 URNs descobertos e cache calibrado, **when** o botão dispara,
  **then** o scheduler faz 23×3 GETs **sequenciais com delay**, e cada payload entra no
  `processCapture` como se fosse captura passiva.
- **Given** o cache **não** tem o `queryId` de reactions, **then** `buildRequest` devolve `null`,
  aquele endpoint é pulado, e o popup mostra *"abra um post uma vez pra calibrar"*.
- **Given** a sessão expirou (cookie inválido → 401/403/px challenge),
  **then** o fan-out **para gracioso**, reporta o progresso parcial, e não reentra em loop.
- **Given** um 429/erro px, **then** o scheduler respeita o delay e não martela o endpoint.

### Passo 7 — `controller.ts`: provenance no export (v3, aditiva)

**Contexto.** `buildExportJSON` (linha 313) emite `schema_version: 3` sem provenance. Cada
`buildPlatformData*` monta os itens de `content[]`. Anexar `provenance` por item **só quando**
`store.provenance[provider][publicationKey]` existir → fixtures profile-puro (sem provenance)
permanecem byte-idênticas; busca ganha o campo.

**Antes/Depois** (esboço em `buildPlatformDataLinkedin`/equivalente):

```ts
// ANTES (montagem de um item de content)
return { author, metrics, text, /* … */ };

// DEPOIS
const prov = store.provenance.linkedin?.[publicationKey("linkedin", id)];
return { author, metrics, text, /* … */, ...(prov ? { provenance: prov } : {}) };
```

**BDD:**
- **Given** um post vindo da busca, **then** seu item no export tem
  `provenance:{mode:"search", value:"Laravel Day SP"}`.
- **Given** as fixtures profile-puro atuais (sem provenance no mapa),
  **then** o export é **byte-idêntico** — os 3 snapshots v3 existentes **passam sem alteração**.
- **Given** o export inteiro, **then** `schema_version` continua `3`.

### Passo 8 — Popup: aba/estado de busca, botão L3, sinais de drift/calibração

**Contexto.** O popup deriva abas de `PROVIDER_METAS`. Adicionar, no contexto LinkedIn:
contagem de posts descobertos + **"N ilegíveis (parser drift)"**, o botão **"Aprofundar
engajamento (L3)"** (desabilitado com tooltip quando não calibrado), e progresso do fan-out.
Mensagens novas no protocolo: `RUN_ACTIVE_FETCH`, `GET_ACTIVE_FETCH_STATUS`.

**BDD:**
- **Given** 23 descobertos e 2 ilegíveis, **then** o popup mostra "23 posts · 2 ilegíveis".
- **Given** cache não calibrado, **then** o botão L3 fica desabilitado com tooltip de calibração.
- **Given** o fan-out roda, **then** o popup mostra "Aprofundado k/23" atualizando.

### Passo 9 — `meta.ts` / manifest: `hostPermissions` do LinkedIn

**Contexto.** O fetch credenciado parte do service worker → exige `hostPermissions` para
`linkedin.com`. Hoje o LinkedIn declara só `matches` (content scripts). Usar o split
`matches`↔`hostPermissions` do ADR-0003. Afeta `src/providers/meta.ts` e `src/manifest.ts`.

**BDD:**
- **Given** o manifest gerado, **then** ele inclui `host_permissions` para o LinkedIn.
- **Given** o Active Fetch do background, **then** o GET credenciado é permitido (sem CORS/perm
  error).

---

## Testes & Gates

- **Parser SDUI:** testes unitários com fixture real (`test/fixtures/linkedin-search-sdui.*`):
  posts bem-formados, item em drift (→ `unreadable++`), ref não-resolvida (→ texto parcial), vazio.
- **Golden-master:** fixture **nova** de busca → snapshot **novo** com `provenance` presente.
  **Os 3 snapshots v3 atuais devem passar inalterados** (campo ausente sem provenance). ⚠️ **NUNCA**
  `bun test -u`; **NUNCA** editar `test/__snapshots__/`.
- **Captura (SDUI + Active Fetch):** sem teste automático — validar carregando `dist/chrome` no
  Chrome, buscando, conferindo descoberta e o fan-out (DevTools/Network + popup).
- Gates finais: `bun test` (0 fail) · `bun run typecheck` (0 erros) · `bun run build`.

## Riscos & mitigações (do ADR-0004)

- **ToS / PerimeterX + Cloudflare:** maior risco. Mitigar com throttle sequencial, delays, replay
  idêntico ao tráfego da sessão, on-demand (sem AFK). Risco residual real.
- **Drift (`queryId`/`clientVersion`/`sdui_ver`):** harvest-and-cache + parser defensivo + sinal
  visível. Manutenção recorrente esperada.
- **`domain.ts:70` "RESERVADO pro v4":** comentário fica defasado quando provenance entrar no v3 —
  atualizar o comentário no Passo 7.

## Questões em aberto

- Reações **nos comentários** e comentários aninhados: fora do L3 v1? (assumido **sim**, fora).
- Paginação da busca (`startIndex`/`count` vistos na `.har`): capturamos só a primeira página
  carregada, ou seguimos a paginação? (assumido **só o que a navegação carregar**, passivo).
