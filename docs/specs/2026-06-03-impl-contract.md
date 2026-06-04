# Contrato de Implementação — LinkedIn Search Scope (L3)

> Data: 2026-06-03 · Branch: `feat/linkedin-search`
> Spec-fonte: [`2026-06-03-linkedin-search-scope-l3.md`](./2026-06-03-linkedin-search-scope-l3.md)
> ADRs: [0002](../adr/0002-providers-plugaveis-ports-and-adapters.md) (ports/adapters),
> [0003](../adr/0003-active-fetch-provider-devto.md) (Active Fetch), [0004](../adr/0004-linkedin-search-scope-active-fetch.md)

**Fonte única para TODOS os implementadores.** Este documento congela: o LAYOUT de arquivos
novos (≤150 linhas cada), as INTERFACES TypeScript EXATAS, as adições ao protocolo de
mensagens, o plano de golden-master, e o mapa issue→arquivos. As shapes abaixo são as REAIS
lidas do código atual; não invente campos.

## Regras inegociáveis (recap)

1. **Arquivo NOVO de source ≤ 150 linhas.** Testes isentos. Decomponha sob
   `src/providers/linkedin/search/` e `src/providers/linkedin/active-fetch/`.
2. **Não refatore** `controller.ts` / `parser.ts` / `popup/index.ts` / `interceptor/index.ts`
   para caber em 150 linhas. Edições nesses arquivos são MÍNIMAS e só chamam a lógica nova.
3. **Os 3 snapshots v3 atuais** (`golden-master export v3 X|Instagram|LinkedIn`) ficam
   byte-idênticos. **NUNCA** `bun test -u`; **NUNCA** editar `test/__snapshots__/`.
4. Português no código/comentários. SOLID + ports/adapters (ADR-0002) + Active Fetch (ADR-0003/0004).

---

## 1. Layout de arquivos/pastas NOVOS + pontos de edição mínima

### 1.1 Árvore nova (cada arquivo ≤150 linhas)

```
src/
├── capture/
│   └── active-fetch.ts          NOVO  ~60 linhas. Tipos do seam Active Fetch:
│                                       ActiveFetchTarget, ActiveFetchFacet, CalibrationCache,
│                                       ActiveFetchResult. Sem chrome.*, sem lógica de rede.
│
├── background/
│   └── active-fetch.ts          NOVO  ~120 linhas. Scheduler runActiveFetch(): fan-out
│                                       SEQUENCIAL com delay; cada resposta → envelope sintético
│                                       → processCapture. Estado do fan-out (status para polling).
│
└── providers/linkedin/
    ├── search/
    │   ├── flight-tokenizer.ts  NOVO  ~90 linhas. Tokeniza o stream React-Flight em
    │   │                               tabela hex→conteúdo + tabela de refs $L. PURO.
    │   ├── post-extractor.ts    NOVO  ~120 linhas. De um nó de post (urn:li:activity) +
    │   │                               tabelas → SocialPublication (autor/texto/métricas). PURO.
    │   └── parse-search-sdui.ts NOVO  ~80 linhas. Orquestra: raw → tokenizer → extractor[] →
    │                                    SduiSearchResult { publications, unreadable }. PURO. Defensivo.
    │
    ├── active-fetch/
    │   ├── calibration.ts       NOVO  ~70 linhas. CalibrationCache em memória do SW +
    │   │                               harvestSignature(url, headers?) chamado do capture.ts.
    │   ├── voyager-request.ts   NOVO  ~110 linhas. buildVoyagerRequest(target, endpoint, calib)
    │   │                               → Request | null (auth por assinatura colhida).
    │   └── facet.ts             NOVO  ~90 linhas. linkedinActiveFetchFacet (enumerate/
    │                                    buildRequest/endpointFor) + synthEnvelope(...).
    │
    └── (parser.ts, capture.ts, index.ts são EDITADOS — ver 1.2; novas funções pequenas
        importadas de search/ e active-fetch/, nunca inline em arquivos legados grandes.)
```

Pasta de testes (isenta do limite):

```
test/
├── fixtures/
│   └── linkedin-search-sdui.ts  NOVO  Fixture real Flight (string) da busca + URL canônica.
├── linkedin-search-sdui.test.ts NOVO  Unit do parser (bem-formado / drift / ref quebrada / vazio).
└── golden-master.test.ts        EDITADO  +1 cenário "LinkedIn (search)" → snapshot NOVO.
```

### 1.2 Pontos de EDIÇÃO MÍNIMA em arquivos existentes

| Arquivo | Edição mínima | Issue |
|---|---|---|
| `src/capture/strategies.ts` | `NetworkMatch` ganha `responseFormat?: "json" \| "text"` (linha 23-25). | #14 |
| `src/interceptor/index.ts` | fetch (linha 83) e XHR (linha 152): ler `match.responseFormat`. **Guardar `match` no objeto resolvido** (hoje só passa `endpoint`). | #14 |
| `src/providers/linkedin/capture.ts` | `linkedinNetworkIntercept.match`: branch da `LINKEDIN_SEARCH_PATH` → `{endpoint:"searchResultsContent", responseFormat:"text"}`; chamar `harvestSignature(url)` no ramo Voyager. | #15 |
| `src/providers/linkedin/index.ts` | `scopeModes` += `search`; `processLinkedInCapture` += branch `searchResultsContent`; `buildPlatformDataLinkedin` lê `store.provenance.linkedin?.[key]` e faz spread aditivo. | #15, #16, #18 |
| `src/providers/linkedin/parser.ts` | **NÃO** editar a lógica Voyager. Só **re-exportar** `parseLinkedInSearchSdui` de `./search/parse-search-sdui` (barril), p/ manter o ponto de import único. | #15 |
| `src/capture/registry.ts` | `CAPTURE_FACETS.linkedin` ganha referência à faceta `activeFetch` (campo novo opcional no `CaptureFacet`). | #17 |
| `src/background/controller.ts` | `ACTIVE_FETCH_FACETS` registry paralelo; dispatch de `RUN_ACTIVE_FETCH`/`GET_ACTIVE_FETCH_STATUS`; `buildPlatformDataLinkedin` já recebe `store` (sem mudança de assinatura). | #17, #18 |
| `src/shared/messages.ts` | +`RunActiveFetchMessage`, +`GetActiveFetchStatusMessage` e responses; entram na união `RuntimeMessage`. | #17 |
| `src/shared/domain.ts` | `ExportLinkedInPost` ganha `provenance?: ScopeProvenance` (opcional); atualizar comentário linha ~243-245. | #18 |
| `src/providers/meta.ts` | `ProviderMeta` ganha `hostPermissions?: string[]`; LinkedIn declara `["https://www.linkedin.com/*"]`. | #17 |
| `src/manifest.ts` | `host_permissions` = spread de `matches` ∪ `hostPermissions`. | #17 |
| `src/popup/index.ts` | `renderLinkedIn`: contagem "N posts · M ilegíveis", botão L3 (disabled se não calibrado), progresso. | #18 |

---

## 2. Interfaces EXATAS (TypeScript)

Todas as shapes referenciam tipos REAIS de `src/shared/domain.ts`. Importam:
`SocialPublication`, `SocialActor`, `SocialMetrics`, `SocialProvider`, `BackgroundStore`,
`ScopeProvenance`, `ExportLinkedInPost`.

### 2.1 `NetworkMatch.responseFormat` — `src/capture/strategies.ts` (#14)

```ts
export type NetworkMatch = {
  endpoint: string;
  // Como o interceptor lê o corpo. Default "json" (clone.json()). "text" (clone.text())
  // para respostas não-JSON, ex.: o stream SDUI/Flight da busca do LinkedIn.
  responseFormat?: "json" | "text";
};
```

O interceptor precisa do `match` inteiro (não só `endpoint`) para honrar o hint. Ajuste
mínimo no `ResolvedStrategy`/fluxo: guardar `match` ao lado de `endpoint`.

### 2.2 Flight tokenizer — `src/providers/linkedin/search/flight-tokenizer.ts` (#15)

```ts
// Stream React-Flight: linhas "HEX_ID:conteúdo". Refs lazy "$L<hex>".
export type FlightTables = {
  // hex_id → conteúdo cru daquela linha (string após o primeiro ':').
  byId: Map<string, string>;
  // Resolve uma ref "$L<hex>" (ou o hex puro) para o conteúdo da linha-alvo; null se não existir.
  resolveRef: (ref: string) => string | null;
};

// Quebra o stream em linhas e monta as tabelas. Defensivo: linha sem ':' é ignorada.
// regex de linha: /^([a-f0-9]+):(.*)$/  (hex greedy, comprimento variável 1..n).
export function tokenizeFlight(raw: string): FlightTables;
```

### 2.3 Post-extractor — `src/providers/linkedin/search/post-extractor.ts` (#15)

```ts
import type { SocialPublication } from "../../../shared/domain";
import type { FlightTables } from "./flight-tokenizer";

// Um candidato a post localizado no stream: a URN da atividade + o blob JSON cru
// (a linha/objeto onde vivem reactionState-urn / memberHeadline / memberFirstName...).
export type PostNode = {
  activityUrn: string; // ex.: "urn:li:activity:7465277392866037760"
  rawObject: string;   // trecho cru com autor + estado de engajamento inline
};

// Localiza os nós de post varrendo as chaves "reactionState-urn:li:activity:" (identifica posts).
export function findPostNodes(tables: FlightTables): PostNode[];

// Extrai UMA SocialPublication de um nó. Resolve:
//  - author: memberFirstName + memberLastName (name); memberHeadline NÃO é nome (vai p/ full_name).
//  - text: children "$L<hex>" → resolveRef; ref quebrada → "" (post entra parcial, não descarta).
//  - metrics: ReactionType_LIKE/APPRECIATION/INTEREST/EMPATHY/PRAISE/ENTERTAINMENT (soma → like_count),
//             commentCount-urn:... → comment_count/reply_count, repostCount-urn:... → repost_count.
// Retorna null se o shape do nó for irreconhecível (chamador conta como unreadable).
export function extractPublication(node: PostNode, tables: FlightTables): SocialPublication | null;
```

`SocialPublication` montada (campos obrigatórios reais, demais nos defaults do parser Voyager):
`provider:"linkedin"`, `publication_id:<activityUrn>`, `type:"post"` (ou
`SocialPublicationType` equivalente), `metrics:SocialMetrics` (use `emptyMetrics()`-like base),
`author:SocialActor` (`provider:"linkedin"`, `provider_user_id`, `username`, `name`,
`avatar_url`, `full_name?:memberHeadline`), `text`, `created_at`, `hashtags:[]`, `media_count:0`,
`url`, `urls:[]`, `user_mentions:[]`, `source:"search_sdui"`. **Não** popular `scope_mode`/`scope_value`
(reservados v4 — a Provenance entra no mapa lateral, ver 2.7).

### 2.4 `parseLinkedInSearchSdui` — `src/providers/linkedin/search/parse-search-sdui.ts` (#15)

```ts
import type { SocialPublication } from "../../../shared/domain";

export type SduiSearchResult = {
  publications: SocialPublication[];
  unreadable: number; // nós cujo shape não foi reconhecido (drift sdui_ver)
};

// PURA e DEFENSIVA: nunca lança. raw vazio/truncado → { publications: [], unreadable: 0 }.
// Cada nó: try → extractPublication; sucesso → push; null/exception → unreadable++.
export function parseLinkedInSearchSdui(raw: string): SduiSearchResult;
```

Re-export de barril em `parser.ts` (sem reescrever o legado):
`export { parseLinkedInSearchSdui } from "./search/parse-search-sdui";`

### 2.5 Search `ScopeMode` — `src/providers/linkedin/index.ts` (#16)

Tipo já existe em `src/providers/contract.ts` (`ScopeMode`). A instância nova:

```ts
{
  id: "search",
  label: "Search",
  // O LinkedIn já filtrou no servidor; tudo que chega por uma busca é in-scope.
  detectFromPage: (pageUrl: string) => new URL(pageUrl).searchParams.get("keywords"),
  selects: () => true,
}
```

`scopeModes` final = `[profile, search]` (profile intacto, search aditivo).
`processLinkedInCapture` ganha:

```ts
if (request.endpoint === "searchResultsContent") {
  const { publications } = parseLinkedInSearchSdui(String(request.payload)); // payload é STRING
  const query =
    (request.pageUrl ? new URL(request.pageUrl).searchParams.get("keywords") : null) ?? "";
  for (const pub of publications) {
    storePublication(store, pub);
    // posts/feedOrder do LinkedIn p/ aparecer no export (mesmo caminho do feed):
    // criar LinkedInPostData mínimo a partir de pub e empurrar em lstore.posts/feedOrder.
    if (query) recordProvenance(store, "linkedin", pub.publication_id, "search", query);
  }
}
```

> Nota: para o post aparecer em `buildPlatformDataLinkedin` (que itera `lstore.feedOrder`),
> a branch de search também alimenta `lstore.posts[id]` + `lstore.feedOrder` com um
> `LinkedInPostData` derivado da `SocialPublication` (id = activityUrn, share_urn = "",
> activity_urn = pub.publication_id, métricas espelhadas). Helper pequeno em `search/`
> (`publicationToPostData`) se passar de poucas linhas.

### 2.6 `CalibrationCache` + `harvestSignature` + `buildVoyagerRequest` (#17)

`src/providers/linkedin/active-fetch/calibration.ts`:

```ts
// Assinatura volátil colhida do tráfego Voyager passivo, para replay do Active Fetch.
// Vive em memória do SW (NÃO persiste no store v3; some no reload do SW).
export type CalibrationCache = {
  queryId_reactions: string | null;  // ex.: "voyagerSocialDashReactions.<hash>"
  queryId_comments: string | null;
  queryId_reposts: string | null;
  clientVersion: string | null;      // de x-li-track (mobileappVersion/clientVersion)
  csrfToken: string | null;          // = cookie JSESSIONID (sem aspas)
  lastUpdated: string | null;        // ISO
};

export function emptyCalibration(): CalibrationCache;

// Calibrado o suficiente p/ pelo menos UM endpoint L3 → habilita o botão (Passo 8).
export function isCalibrated(c: CalibrationCache): boolean; // true se algum queryId_* != null.

// Colhe queryId/clientVersion da URL Voyager passiva (efeito colateral dentro do match()).
// Atualiza o singleton do SW; nunca lança. headers é opcional (XHR/fetch podem não expor).
export function harvestSignature(url: string, headers?: Record<string, string>): void;

// Acesso ao singleton (o background lê na hora de calibrar o botão / montar requests).
export function getCalibration(): CalibrationCache;
```

`src/providers/linkedin/active-fetch/voyager-request.ts`:

```ts
import type { ActiveFetchTarget } from "../../../capture/active-fetch";
import type { CalibrationCache } from "./calibration";

// endpoint lógico → null se a assinatura daquele endpoint não foi colhida.
// Monta GET voyager/api/graphql?queryId=<colhido>&variables=(...urn...).
// Headers: csrf-token (=JSESSIONID), x-restli-protocol-version:2.0.0,
//          accept:application/vnd.linkedin.normalized+json+2.1, x-li-track:<colhido>.
// credentials:"include" (reusa cookie da sessão).
export function buildVoyagerRequest(
  target: ActiveFetchTarget,
  endpoint: "socialDashReactions" | "socialDashComments" | "feedDashReshareFeed",
  calib: CalibrationCache,
): Request | null;
```

### 2.7 `ActiveFetchTarget` / `ActiveFetchFacet` + registry — `src/capture/active-fetch.ts` (#17)

```ts
import type { BackgroundStore, SocialProvider } from "../shared/domain";
import type { CalibrationCache } from "../providers/linkedin/active-fetch/calibration";

// Um alvo de aprofundamento: identidade lógica + a URN da atividade a aprofundar.
export type ActiveFetchTarget = {
  id: string;          // chave estável (ex.: o próprio activity_urn)
  activityUrn: string; // urn:li:activity:...
};

// Faceta de Active Fetch de um provider (registro PARALELO a BACKGROUND_PROVIDERS).
export type ActiveFetchFacet = {
  id: SocialProvider;
  // Enumera alvos a partir do store (LinkedIn: os activity_urn descobertos na busca).
  enumerate: (store: BackgroundStore) => ActiveFetchTarget[];
  // Endpoints lógicos a aprofundar por alvo (ordem de fan-out).
  endpoints: (target: ActiveFetchTarget) => string[];
  // Request GET por (alvo, endpoint); null se não calibrado (endpoint pulado).
  buildRequest: (target: ActiveFetchTarget, endpoint: string, calib: CalibrationCache) => Request | null;
  // Empacota a resposta crua num envelope sintético idêntico ao da captura passiva.
  synthEnvelope: (target: ActiveFetchTarget, endpoint: string, payload: unknown, url: string) => SyntheticCapture;
};
```

`linkedinActiveFetchFacet` mora em `src/providers/linkedin/active-fetch/facet.ts`.
Registry paralelo em `controller.ts`:

```ts
const ACTIVE_FETCH_FACETS: Partial<Record<SocialProvider, ActiveFetchFacet>> = {
  linkedin: linkedinActiveFetchFacet,
};
```

`CaptureFacet` (em `strategies.ts`) ganha campo opcional para descoberta via registry de captura:
`activeFetch?: ActiveFetchFacet;` (LinkedIn aponta para a mesma instância).

### 2.8 Envelope sintético que entra no `processCapture` (#17)

O fan-out NÃO inventa shape: monta exatamente o `CapturedPayloadMessage` real de
`src/shared/messages.ts` e o passa por `BACKGROUND_PROVIDERS[provider].processCapture`.

```ts
import type { CapturedPayloadMessage } from "../shared/messages";

// Alias semântico — é literalmente o envelope de captura passiva.
export type SyntheticCapture = CapturedPayloadMessage;
// { action:"CAPTURED_PAYLOAD"; provider:SocialProvider; endpoint:string;
//   payload:unknown; url?:string; pageUrl?:string; timestamp:string }
```

`synthEnvelope` do LinkedIn produz, p/ cada endpoint:
`{ action:"CAPTURED_PAYLOAD", provider:"linkedin", endpoint:"socialDashReactions"|"socialDashComments"|"feedDashReshareFeed", payload:<json voyager>, url:<url canônica com queryId>, timestamp:new Date().toISOString() }`.
Como `endpoint`/`url` batem com os ramos atuais de `processLinkedInCapture`, o aprofundamento
reusa `linkedinParseReactions/Comments/Reposts` SEM novo código de parsing.

### 2.9 `runActiveFetch` (scheduler) — `src/background/active-fetch.ts` (#17)

```ts
import type { BackgroundStore, SocialProvider } from "../shared/domain";

export type ActiveFetchStatus = {
  running: boolean;
  total: number;        // alvos × endpoints calibrados
  done: number;
  actorsCaptured: number;
  startedAt: string | null;
  finishedAt: string | null;
  error?: string;       // "uncalibrated" | "session_expired" | "rate_limited" | ...
};

// Fan-out SEQUENCIAL com delay. Para cada alvo enumerado e cada endpoint:
//  buildRequest → fetch(credentials:"include") → json → synthEnvelope → processCapture(store, env).
//  null em buildRequest → pula (não calibrado). 401/403/px → para gracioso (status.error).
//  429 → respeita delay, não martela. Atualiza o status para polling (GET_ACTIVE_FETCH_STATUS).
// On-demand apenas (sem AFK). Singleton de status por provider no SW.
export async function runActiveFetch(store: BackgroundStore, provider: SocialProvider): Promise<ActiveFetchStatus>;

export function getActiveFetchStatus(provider: SocialProvider): ActiveFetchStatus;
```

### 2.10 Anexar Provenance no export — `buildPlatformDataLinkedin` (#18)

`ExportLinkedInPost` (em `domain.ts`) ganha:

```ts
export type ExportLinkedInPost = Omit<LinkedInPostData, "engagers"> & {
  engagers: { reactions: LinkedInReactionUser[]; reposts: LinkedInRepostEntry[]; comments: ExportComment[] };
  engagement_metrics: LinkedInEngagementMetrics;
  provenance?: ScopeProvenance; // ADITIVO: presente SÓ quando store.provenance tiver a chave.
};
```

Ponto EXATO em `buildPlatformDataLinkedin` (`src/providers/linkedin/index.ts:344`), na
montagem do item `acc.push({...})`. Antes/depois:

```ts
// ANTES
acc.push({ ...post, engagers: {...}, engagement_metrics: engagementMetrics });

// DEPOIS
const prov = store.provenance.linkedin?.[publicationKey("linkedin", post.activity_urn)];
acc.push({
  ...post,
  engagers: {...},
  engagement_metrics: engagementMetrics,
  ...(prov ? { provenance: prov } : {}),
});
```

A chave de lookup é `publicationKey("linkedin", id)` onde `id` é o MESMO `publication_id`
gravado em `recordProvenance` (o `activityUrn`). **Byte-compat:** fixtures profile-puro não
têm entrada em `store.provenance.linkedin` → spread vazio → snapshot idêntico.
Atualizar o comentário de `ScopeProvenance` (domain.ts ~243-245): de "nunca é lido por
buildPlatformData*" para "lido por buildPlatformDataLinkedin no v3 (search); ausente sem provenance".

---

## 3. Adições ao protocolo de mensagens (`src/shared/messages.ts`) (#17, #18)

```ts
export type RunActiveFetchMessage = {
  action: "RUN_ACTIVE_FETCH";
  provider: SocialProvider; // "linkedin"
};

export type GetActiveFetchStatusMessage = {
  action: "GET_ACTIVE_FETCH_STATUS";
  provider: SocialProvider;
};

// Resposta de ambos = ActiveFetchStatus (de src/background/active-fetch.ts).
// RUN dispara o scheduler e devolve o status inicial; GET é polling do andamento.
```

Entram na união `RuntimeMessage` (linha 167-188). Dispatch novo em `handleRuntimeMessage`
(dois `if` curtos, perto de `DETECT_TARGET`):

```ts
if (request.action === "RUN_ACTIVE_FETCH") return runActiveFetch(store, request.provider);
if (request.action === "GET_ACTIVE_FETCH_STATUS") return getActiveFetchStatus(request.provider);
```

`GET_PLATFORM_DATA` do LinkedIn (controller.ts:683-704) ganha campo `unreadable:number`
(soma das `unreadable` das capturas de busca; guardar acumulado no store ou recomputar) e o
estado de calibração `calibrated:boolean` para o popup desabilitar o botão L3.
Tipo `PlatformDataResponse`/render do popup acomodam o campo opcional (sem quebrar X/IG).

`DETECT_TARGET` (controller.ts:765-771): hoje fixa `mode:"profile"`. Generalizar para tentar
`search` antes de `profile` quando `detectFromPage` de `search` retornar `keywords` não-nulo:

```ts
const modes = BACKGROUND_PROVIDERS[request.provider]?.scopeModes ?? [];
for (const mode of modes) {
  const target = mode.detectFromPage?.(request.pageUrl) ?? null;
  if (target) return { mode: mode.id, target };
}
return { mode: "profile", target: null };
```

> Backward-compat: `profile` do LinkedIn não tem `detectFromPage` (retorna null), então o
> loop só casa `search` quando há `?keywords=`. X/Instagram inalterados.

---

## 4. Plano do golden-master (cenário novo → snapshot novo; 3 atuais intactos)

**Invariante:** os snapshots `golden-master export v3 X 1`, `... Instagram 1`, `... LinkedIn 1`
(`test/__snapshots__/golden-master.test.ts.snap`, linhas 3/307/592) ficam **byte-idênticos**.
Garantido porque: (a) `provenance` é spread aditivo só quando `store.provenance.linkedin[key]`
existe — os 3 cenários atuais não chamam `recordProvenance` com mode `search`; o cenário
LinkedIn atual usa endpoint `feedDashOrganizationalPageUpdates` com handle, que grava
provenance `profile` MAS o snapshot LinkedIn atual NÃO espera provenance no item de content.
⚠️ **Verificação obrigatória:** o cenário LinkedIn atual JÁ chama `recordProvenance(..., "profile", handle)`
(index.ts:44). Como hoje `buildPlatformDataLinkedin` NÃO lê `store.provenance`, o snapshot não
tem o campo. Ao adicionar o spread (2.10), o item LinkedIn-profile passaria a expor
`provenance:{mode:"profile",value:"He4rt Developers"}` → **quebraria o snapshot atual**.

**Decisão (trava de byte-compat):** o spread em `buildPlatformDataLinkedin` só anexa quando
`prov.mode === "search"`. Ou seja, provenance entra no export v3 **apenas para o modo search**;
profile permanece interno (como hoje). Forma exata:

```ts
const prov = store.provenance.linkedin?.[publicationKey("linkedin", post.activity_urn)];
const exportProv = prov && prov.mode === "search" ? prov : null;
...(exportProv ? { provenance: exportProv } : {})
```

Isso mantém os 3 snapshots intactos (o LinkedIn-profile tem `mode:"profile"` → não anexa) e
satisfaz o Passo 7 da spec (busca ganha o campo). Documentar essa restrição como o
ponto de extensão para v4 (quando profile também migrar para o export).

**Cenário NOVO** em `test/golden-master.test.ts` (após linha 107):

```ts
test("LinkedIn (search)", () => {
  const { send } = harness();
  send({ action: "SET_HANDLE", handle: "", provider: "linkedin" });
  capture(send, {
    provider: "linkedin",
    endpoint: "searchResultsContent",
    payload: linkedinSearchSduiPayload, // STRING Flight (fixture nova)
    pageUrl: "https://www.linkedin.com/search/results/content/?keywords=Laravel+Day+SP",
  });
  expect(exportOf(send)).toMatchSnapshot(); // gera snapshot NOVO automaticamente
});
```

Gera `golden-master export v3 LinkedIn (search) 1` — snapshot NOVO, com `provenance:
{mode:"search", value:"Laravel Day SP"}` nos itens de `per_platform.linkedin.content[]`.
**Rodar `bun test` uma vez** para o Bun gerar o snapshot novo; revisar manualmente; **nunca** `-u`.

**Unit do parser** (`test/linkedin-search-sdui.test.ts`):
- post bem-formado → `publications[0].author.name`, `text` resolvido, `metrics.like_count` somado.
- nó em drift (shape desconhecido) → não entra; `unreadable` incrementa; sem throw.
- ref `$L` quebrada → post entra com `text:""` (parcial), autor/métricas válidos.
- string vazia/truncada → `{ publications: [], unreadable: 0 }`.

---

## 5. Mapa issue → arquivos

### #14 — Camada genérica: `responseFormat` (interceptor honra hint)
- **Edita:** `src/capture/strategies.ts` (`NetworkMatch.responseFormat?`),
  `src/interceptor/index.ts` (fetch L83 + XHR L152 leem `match.responseFormat`; guardar `match`
  no resolvido).
- **Gate:** X/Instagram/Voyager seguem em `json()` (retrocompat). Sem teste automático (browser).

### #15 — Captura SDUI: match da busca + parser Flight defensivo
- **Cria:** `src/providers/linkedin/search/flight-tokenizer.ts`, `.../post-extractor.ts`,
  `.../parse-search-sdui.ts`; `test/fixtures/linkedin-search-sdui.ts`;
  `test/linkedin-search-sdui.test.ts`.
- **Edita:** `src/providers/linkedin/capture.ts` (branch `LINKEDIN_SEARCH_PATH` +
  `harvestSignature`), `src/providers/linkedin/parser.ts` (re-export barril).

### #16 — Scope `search` + Provenance no processCapture
- **Edita:** `src/providers/linkedin/index.ts` (`scopeModes` += search;
  `processLinkedInCapture` branch `searchResultsContent` → `parseLinkedInSearchSdui` +
  `storePublication` + alimentar `lstore.posts`/`feedOrder` + `recordProvenance("search", query)`).
- **Edita (mensagens):** `src/background/controller.ts` `DETECT_TARGET` generalizado (loop modes).

### #17 — Seam Active Fetch (background fan-out) + manifest
- **Cria:** `src/capture/active-fetch.ts` (tipos), `src/background/active-fetch.ts`
  (`runActiveFetch`/`getActiveFetchStatus`), `src/providers/linkedin/active-fetch/calibration.ts`,
  `.../voyager-request.ts`, `.../facet.ts`.
- **Edita:** `src/capture/strategies.ts` (`CaptureFacet.activeFetch?`),
  `src/capture/registry.ts` (`CAPTURE_FACETS.linkedin.activeFetch`),
  `src/providers/linkedin/capture.ts` (`harvestSignature` no ramo Voyager — compartilhado com #15),
  `src/background/controller.ts` (`ACTIVE_FETCH_FACETS` + dispatch `RUN_ACTIVE_FETCH`/`GET_ACTIVE_FETCH_STATUS`),
  `src/shared/messages.ts` (mensagens novas + união), `src/providers/meta.ts`
  (`ProviderMeta.hostPermissions?`), `src/manifest.ts` (`host_permissions` ∪ `hostPermissions`).

### #18 — Provenance no export v3 + popup (UI)
- **Edita:** `src/shared/domain.ts` (`ExportLinkedInPost.provenance?` + comentário `ScopeProvenance`),
  `src/providers/linkedin/index.ts` (`buildPlatformDataLinkedin` spread `provenance` só `mode==="search"`),
  `src/background/controller.ts` (`GET_PLATFORM_DATA` linkedin += `unreadable`/`calibrated`),
  `src/popup/index.ts` (`renderLinkedIn`: "N posts · M ilegíveis", botão L3 disabled/tooltip, progresso),
  `src/shared/messages.ts` (`PlatformDataResponse`/resposta linkedin acomoda `unreadable?`/`calibrated?`).
- **Cria/Edita (teste):** `test/golden-master.test.ts` (+cenário search → snapshot NOVO),
  `test/fixtures/linkedin-search-sdui.ts` (compartilhada com #15).

---

## 6. Gates finais (toda issue)

```
bun test          # 0 fail; 3 snapshots v3 atuais byte-idênticos; snapshot search novo OK
bun run typecheck # 0 erros
bun run build     # "Extensão compilada em dist/chrome"
```

Captura SDUI + Active Fetch não têm teste automático: validar carregando `dist/chrome` no
Chrome, buscando, conferindo descoberta (popup "N posts · M ilegíveis") e o fan-out L3
(DevTools/Network + progresso no popup).
