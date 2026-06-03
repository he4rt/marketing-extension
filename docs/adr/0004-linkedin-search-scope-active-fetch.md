# ADR 0004: LinkedIn Search Scope — descoberta SDUI passiva + aprofundamento L3 por Active Fetch

## Status

Proposto. **Estende o [ADR-0003](./0003-active-fetch-provider-devto.md)** (Active Fetch), que
hoje vive só no branch `feat/forem-provide` — esta decisão o trata como **dependência pendente**:
o ADR-0004 referencia o seam Active Fetch e será a sua **primeira implementação**. Se o ADR-0003
não mergear antes, esta implementação carrega o seam consigo.

Também é a primeira realização concreta do **Scope `search`** previsto no `CONTEXT.md`
(*"extensível a hashtag, campaign, post"*) e do **Scope sem Tracked Account**.

## Contexto

O LinkedIn já tem captura passiva (Voyager GraphQL + BPR `<code>`) escopada ao modo `profile`,
onde a **Tracked Account** é a autora das Publications. Queremos medir o **alcance de um evento da
comunidade** — ex.: a busca `"Laravel Day SP"` — respondendo "quem da comunidade falou do tema,
com quais números e comentários". Isso **inverte** o modelo: os autores dos posts são pessoas
quaisquer, não a conta da comunidade, e o alvo é uma **palavra-chave/evento, não um Handle**.

A captura de uma `.har` real (`www.linkedin.com.har`, busca "Laravel Day SP") revelou três fatos
que moldam a decisão:

1. **A busca não passa pelo Voyager GraphQL.** Vem de `GET /flagship-web/search/results/content/`
   e `/all/`, com corpo `application/octet-stream` no **formato SDUI / React-Flight**
   (`com.linkedin.sdui.flagshipnav.search.SearchResultsContent`) — não o JSON do Voyager nem o
   BPR `<code>` que a captura atual lê. Os dados existem (1580 `urn:li:activity`, contadores de
   reação, `memberHeadline` do autor inline), mas o **texto do post é deferido** via refs lazy
   (`"children":"$L40"`), exigindo um parser de Flight defensivo.
2. **O engajamento profundo (L3) só existe ao abrir cada post.** "Quem reagiu / comentou /
   repostou" vem de `voyagerSocialDashReactions`, `voyagerSocialDashComments`,
   `voyagerFeedDashReshareFeed` — endpoints que **já estão** no `LINKEDIN_ENDPOINT_MAP`, mas só
   disparam na navegação ao abrir o post. Capturá-los sem abrir 40 posts à mão (≈120 cliques)
   exige **originar** os requests — Active Fetch.
3. **O alvo é hostil.** A `.har` mostra **PerimeterX/HUMAN** (`collector-pxdojv695v.protechts.net`,
   cookie `_pxvid`) e **Cloudflare** (`__cf_bm`) — bot-detection ativo que o dev.to (ADR-0003) não
   tinha. E as assinaturas de request **rotacionam**: `queryId` (hash por deploy), `x-li-track`
   `clientVersion`, `sdui_ver` (formato da busca é versionado).

Faseamento foi considerado e **rejeitado pelo dono** (decisão de produto): L3 completo de uma vez.

## Decisão

Adicionar ao LinkedIn um **Scope `search`** coletado em **dois estágios** — descoberta passiva +
aprofundamento por Active Fetch — sem `if` por rede nas camadas genéricas e mantendo o **export v3
byte-compatível**.

```
 ESTÁGIO 1 — DESCOBERTA (Passive Capture)
  detectFromPage(?keywords=) → Collection Target {linkedin, search, "<query>"}  (auto)
  interceptor capta /flagship-web/search/results/content  → responseFormat: "text"
  parser SDUI defensivo  → [{activity_urn, autor, texto, contadores}]
  store.platforms.linkedin + provenance[urn] = {mode:"search", value:"<query>"}

 ESTÁGIO 2 — APROFUNDAMENTO L3 (Active Fetch, botão, sem AFK)
  fan-out sequencial (com delay) sobre os URNs descobertos:
    voyagerSocialDashReactions · voyagerSocialDashComments · voyagerFeedDashReshareFeed
  → MESMO processCapture → Actors/Comments/Engagements + provenance
```

Decisões específicas:

- **Scope `search` sem Tracked Account.** O `value` é a query/evento; `selects()` não re-filtra por
  palavra-chave (o LinkedIn já filtrou) — tudo que chega por uma captura de busca é carimbado com a
  Provenance `{search, <query>}`. O `CONTEXT.md` foi atualizado: *"nem todo Scope tem Tracked
  Account"*.
- **Descoberta é passiva.** Você realmente fez a busca; nenhuma postura nova. O único ajuste
  genérico é o interceptor aprender a capturar resposta **`text`** (Flight), não só `json()`: o
  resultado de `match()` passa a poder declarar `responseFormat: "text"` por URL. O interceptor
  continua sem conhecer redes — só respeita um hint da estratégia.
- **Parser SDUI defensivo.** Resolve refs `$L` para recuperar texto; shape desconhecido **pula o
  item sem crashar** e incrementa um contador de "ilegíveis (parser drift)" exposto no popup. O
  `sdui_ver` versionado torna isso obrigatório, não opcional.
- **Aprofundamento por Active Fetch, primeira implementação do ADR-0003.** O LinkedIn estende o
  seam em três eixos que o dev.to não exercita:
  - **Híbrido passivo+ativo** (o dev.to é Background-only): a descoberta é content-script, o
    aprofundamento é background. Prova que o seam **compõe** com captura passiva.
  - **Auth por assinatura colhida (harvest-and-cache):** além de cookie via `credentials:"include"`,
    o replay do Voyager precisa de `csrf-token` (= valor do cookie `JSESSIONID`),
    `x-restli-protocol-version: 2.0.0`, `accept: application/vnd.linkedin.normalized+json+2.1`, e
    `x-li-track`/`queryId` **colhidos do tráfego passivo e cacheados**. Se nunca observados, o
    aprofundamento fica desabilitado com aviso *"abra um post uma vez pra calibrar"* — nunca um 400
    silencioso. Isto é um **novo esquema de auth** do Active Fetch, ao lado de `api-key`/`cookie`.
  - **Enumeração a partir da captura passiva:** os alvos do fan-out são os **URNs descobertos** na
    busca, não um endpoint fixo da própria conta (dev.to: `GET /api/articles/me`).
- **Sem AFK.** O aprofundamento depende de sessão (cookie) e de assinaturas frescas — o ADR-0003 já
  cravou que engagement session-based não roda em background. Só on-demand, com você presente.
- **Provenance entra no export, mantendo `schema_version: 3`.** Cada item ganha
  `provenance: {mode, value}` **só quando presente** no mapa lateral. As fixtures atuais são
  profile-puro e não populam provenance → os três snapshots v3 ficam **byte-idênticos**; a busca
  ganha um snapshot **novo**. O rótulo `v4` (`domain.ts:70`, "reservado") fica para quando existir
  um Hub que precise enxergar a virada de versão — hoje não existe.
- **`hostPermissions` para o LinkedIn.** O fetch credenciado parte do service worker; o LinkedIn
  passa a declarar `hostPermissions` (o split `matches`↔`hostPermissions` que o ADR-0003 introduziu)
  além dos `matches` que já tinha — é um provider **híbrido**, não Background-only.

## Alternativas consideradas

- **Fasear (descoberta primeiro, L3 depois)** — rejeitada pelo dono: L3 completo de uma vez.
- **L3 passivo (abrir cada post + cada lista à mão)** — rejeitada: ≈120 cliques para ~40 posts; não
  escala. O interceptor Voyager atual capturaria, mas o custo humano inviabiliza.
- **Pinar `queryId`/`clientVersion` como constantes** — rejeitada: o LinkedIn rotaciona por deploy;
  pinar quebra calado entre releases. Harvest-and-cache recalibra sozinho na próxima navegação.
- **Bump do export para `schema_version: 4` agora** — rejeitada: sem Hub que consuma, o número é
  cosmético e custaria regenerar os três snapshots (fere o gate INEGOCIÁVEL). Provenance entra
  aditiva no v3; o v4 espera um consumidor real.
- **Active Fetch via Playwright/OpenClaw (ADR-0001)** — rejeitada por ora: o cookie de sessão já
  vive no navegador logado; idem racional do ADR-0003. Continua o caminho se virar headless.
- **Re-filtrar a busca por palavra-chave no `selects()`** — rejeitada: o LinkedIn já filtrou no
  servidor; re-filtrar arriscaria descartar posts legítimos por divergência de normalização.

## Consequências

**Positivas**
- LinkedIn Search entra reusando `processCapture`/parser/store/export; o export v3 segue
  byte-compatível (provenance aditiva, snapshots velhos intactos).
- É a **primeira implementação do Active Fetch** e a valida num cenário mais completo que o dev.to
  (híbrido + auth por assinatura colhida + enumeração vinda da captura passiva). O seam nasce mais
  geral.
- Concretiza o **Scope sem Tracked Account** — destrava `hashtag`/`campaign` futuros.

**Negativas / custos**
- **ToS muito mais afiado que o dev.to:** o LinkedIn é litigioso (hiQ v. LinkedIn) e roda
  **PerimeterX + Cloudflare**. Requests Voyager originados sem os tokens px corretos podem ser
  flagrados. Mitiga-se com throttle sequencial, delays, replay de requests idênticos aos que a
  sessão já faz, e on-demand (nunca AFK) — mas o risco residual é real e **maior** que o do ADR-0003.
- **Fragilidade por drift:** `queryId`/`clientVersion`/`sdui_ver` mudam por deploy; o parser SDUI e o
  replay quebram periodicamente. Mitigado por harvest-and-cache + parser defensivo + sinal de drift
  visível no popup — mas exige manutenção recorrente.
- **Captura SDUI não tem teste automático** (como toda a camada de captura) — só se valida no Chrome.
  O parser puro do Flight, sim, é testável com fixtures.
- **Primeiro scheduler de fan-out do LinkedIn** no background (enumerar URNs → 3 endpoints por URN
  com delay), análogo ao que o ADR-0003 previu para o dev.to.
