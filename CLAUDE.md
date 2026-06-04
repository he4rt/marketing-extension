# CLAUDE.md

Guia de arquitetura do **He4rt Analytics** para agentes de código. Self-contained:
o que é, como está organizado, e **onde mexer** para manter o app.

> Idioma do repositório: **português** (código, comentários e docs).

---

## O que é

Extensão de navegador (**Manifest V3**, Bun + TypeScript) que **intercepta passivamente**
as respostas de API/DOM de redes sociais enquanto você navega e exporta um **JSON
estruturado (schema v3)** para ingestão no **He4rt Hub** (Laravel). Não automatiza
cliques nem faz scraping agressivo — só observa o que a página já carrega e consolida.

Redes suportadas hoje: **X/Twitter** e **Instagram** (captura validada no browser) e
**LinkedIn** (background/export prontos e cobertos por testes; captura em estabilização).

A regra de ouro do projeto: **adicionar uma rede ≈ uma pasta + três registros.** As
camadas genéricas não conhecem redes individuais.

---

## Stack e comandos

```bash
bun install            # dependências (biome, typescript, @types/*)
bun run build          # compila a extensão para dist/chrome
bun test               # suíte (inclui o golden-master do export v3)
bun run typecheck      # tsc --noEmit (deve ficar em 0 erros)
bun run check          # Biome (lint + format)
bun run format         # formata o código
bun run validate       # check + valida o Manifest V3 + smoke test
```

Carregue `dist/chrome` em `chrome://extensions/` com o **Modo desenvolvedor** ligado.

---

## Arquitetura — camadas e contextos de execução

A CSP restrita dos sites sociais obriga a dividir a captura em dois "mundos" de content
script, que conversam por `window.postMessage`. O background (service worker) é o
cérebro: filtra, consolida e exporta. O popup é só a UI.

```
┌─ Página do site social ─────────────────────────────────────────────────────┐
│                                                                              │
│  MAIN world                         ISOLATED world                           │
│  ┌────────────────────────┐         ┌────────────────────────┐               │
│  │ src/interceptor        │         │ src/content            │               │
│  │ patch em fetch/XHR      │ window. │ ponte + varredura DOM   │               │
│  │ (estratégia network)    │postMsg ▶│ (ssr/code/scrape)       │               │
│  └────────────────────────┘         └───────────┬────────────┘               │
└──────────────────────────────────────────────────┼──────────────────────────┘
                                                   │ chrome.runtime.sendMessage
                                                   ▼
                              ┌──────────────────────────────┐     ┌────────────┐
                              │ src/background (service worker)│◀───▶│ src/popup  │
                              │ controller (engine + registry) │ msgs│ abas/export│
                              │ store (consolidação)           │     └────────────┘
                              └───────────────┬────────────────┘
                                              │ GET_EXPORT → JSON v3
                                              ▼
                                     He4rt Hub (Laravel)
```

- **`src/interceptor` (MAIN)** — aplica monkey-patch em `fetch`/`XHR`. NÃO sabe de redes:
  resolve a estratégia `networkIntercept` do provider do host atual no **registry de
  captura** e emite `SOCIAL_CAPTURED`.
- **`src/content` (ISOLATED)** — recebe `SOCIAL_CAPTURED` e repassa como `CAPTURED_PAYLOAD`
  ao background. Também roda as estratégias de DOM do provider ativo (`ssrScriptScan`,
  `embeddedCodeScan`, `liveDomScrapes`) e anuncia `PAGE_SESSION_STARTED`.
- **`src/background` (service worker)** — `controller.ts` é o engine genérico de mensagens;
  despacha a captura para a faceta do provider via registry; `store.ts` consolida tudo no
  store per-platform; `buildExportJSON` monta o v3 iterando os providers.
- **`src/popup`** — abas e identidade visual derivadas de `PROVIDER_METAS`; dispara
  `GET_EXPORT`, `GET_PLATFORM_DATA`, etc.

---

## Mapa do repositório

```
src/
├── interceptor/index.ts     Motor de rede (MAIN). Patcheia fetch/XHR, delega ao registry.
├── content/index.ts         Motor de DOM (ISOLATED). Ponte + ssr/code/scrape genéricos.
├── popup/index.ts           UI: abas, render por plataforma, botões de export.
├── manifest.ts              Gera o manifest.json a partir de PROVIDER_METAS.
│
├── background/
│   ├── index.ts             Bootstrap do service worker (listeners, persistência).
│   ├── controller.ts        Engine: handleRuntimeMessage, createStore, buildExportJSON,
│   │                        reprocessPayloads, BACKGROUND_PROVIDERS (registry de processo).
│   └── store.ts             Helpers de consolidação: storePublication/Comment/Engagement,
│                            getEndpointStore, recordRawPayload, trackedHandleForProvider.
│
├── capture/
│   ├── strategies.ts        Tipos das estratégias de captura + CaptureFacet.
│   └── registry.ts          CAPTURE_FACETS: qual estratégia cada provider declara.
│
├── providers/
│   ├── meta.ts              PROVIDER_METAS (id/hosts/matches/cor/abas) + providerForHost.
│   ├── contract.ts          BackgroundProviderFacet, ScopeMode, CollectionTarget.
│   ├── shared/utils.ts      publicationKey e utilitários comuns aos providers.
│   ├── x/         { parser.ts · capture.ts · index.ts }
│   ├── instagram/ { parser.ts · capture.ts · index.ts }
│   └── linkedin/  { parser.ts · capture.ts · index.ts }
│
└── shared/
    ├── domain.ts            Modelos (Social*, NormalizedStore, *Store, Export v3, ScopeMode).
    └── messages.ts          Protocolo de mensagens (RuntimeMessage + mensagens de página).

scripts/                     build.ts · validate-extension.ts · package-extension.ts
test/                        suíte + test/__snapshots__/ (golden-master) + fixtures/
docs/                        ADRs, CONTEXT.md (glossário), export-format.md, explainer HTML.
```

---

## O modelo de Provider (o coração)

Cada rede é uma **pasta coesa** com três facetas, mais utilitários compartilhados:

```
src/providers/<rede>/
  parser.ts    Funções PURAS: payload cru ──▶ modelos de domínio (Social*/TweetData/…).
               Sem estado, sem chrome.*, testável isoladamente.
  capture.ts   Estratégias de captura por contexto (CaptureFacet). Declara COMO detectar
               os dados na página (rede / SSR / código embutido / DOM visível).
  index.ts     Faceta de background: processCapture(store, capture) consolida no store;
               buildPlatformData<Rede> + computeSummary<Rede> montam o bloco do export v3;
               scopeModes[] declara os modos de coleta; export const <rede>Provider.
```

E três **registries** — as únicas fontes de verdade que as camadas genéricas consultam:

| Registry | Arquivo | Papel |
|---|---|---|
| `PROVIDER_METAS` | `providers/meta.ts` | Identidade: id, hosts, matches do manifest, cor, abas do popup. |
| `CAPTURE_FACETS` | `capture/registry.ts` | Quais estratégias de captura cada provider declara. |
| `BACKGROUND_PROVIDERS` | `background/controller.ts` | Qual faceta processa a captura no service worker. |

### Estratégias de captura (`capture/strategies.ts`)

Uma `CaptureFacet` combina, opcionalmente:

| Estratégia | Contexto | Para quê |
|---|---|---|
| `networkIntercept` | MAIN | Casar URLs de API e extrair o nome do endpoint (`match`/`gate`/`rename`). |
| `ssrScriptScan` | ISOLATED | Ler JSON embutido em `<script>` no HTML server-side. |
| `embeddedCodeScan` | ISOLATED | Ler payloads embutidos em elementos `<code>` (ex.: LinkedIn BPR). |
| `liveDomScrapes[]` | ISOLATED | Raspar o DOM renderizado e emitir `VISIBLE_*` (ex.: feed/comentários do IG). |

Exemplo mínimo (X, só rede) — `src/providers/x/capture.ts`:

```ts
export const xNetworkIntercept: NetworkInterceptStrategy = {
  kind: "networkIntercept",
  match(url) {
    const endpoint = extractXEndpointName(url); // segmento após o queryId do GraphQL
    return endpoint ? { endpoint } : null;
  },
};
```

---

## Como adicionar um provider

Sequência mínima — cada passo é um arquivo/registro:

```
1. providers/meta.ts          Registrar ProviderMeta { id, name, color, popupPrefix,
                              hosts, matches }. Isso já entra no manifest e no popup.
2. providers/<id>/parser.ts   Funções puras que extraem modelos do payload daquela rede.
3. providers/<id>/capture.ts  Declarar a(s) estratégia(s) de captura (CaptureFacet).
4. providers/<id>/index.ts    processCapture(store, capture) + buildPlatformData<Id> +
                              computeSummary<Id> + scopeModes + export const <id>Provider.
5. capture/registry.ts        Adicionar a entrada em CAPTURE_FACETS[<id>].
6. background/controller.ts    Registrar em BACKGROUND_PROVIDERS[<id>] e, para entrar no
                              export, chamar buildPlatformData<Id>/computeSummary<Id> em
                              buildExportJSON.
```

`SocialProvider` (em `shared/domain.ts`) é a união de ids — adicione o novo id lá para
o TypeScript guiar o resto. Nenhuma camada genérica (interceptor/content/popup/manifest)
precisa de `if` por rede: todas iteram os registries.

---

## Fluxo de uma captura

```
 USUÁRIO                                  EXTENSÃO
  │                                          │
  │  📱 navega o feed de uma rede            │
  │ ───────────────────────────────────────►│  interceptor (MAIN): fetch/XHR patcheado
  │                                          │  registry → estratégia networkIntercept
  │                                          │  match(url) → { endpoint }
  │                                          │  postMessage SOCIAL_CAPTURED
  │                                          │
  │                                          │  content (ISOLATED): recebe e encaminha
  │                                          │  chrome.runtime → CAPTURED_PAYLOAD
  │                                          │
  │                                          │  background: BACKGROUND_PROVIDERS[id]
  │                                          │  .processCapture(store, capture)
  │                                          │  parser extrai → store.platforms[id]
  │                                          │  filtra pelo handle rastreado · dedup
  │                                          │
  │  👆 popup → Exportar JSON                │
  │ ───────────────────────────────────────►│  buildExportJSON() itera os providers
  │    ┌──────────────────────────────────┐  │  → { schema_version: 3, meta,
  │    │ he4rt-analytics-<data>.json       │  │      per_platform, unified }
  │    │ (download)                        │  │
  │    └──────────────────────────────────┘  │
```

Detalhe importante: o estado é **volátil** (vive no `store` do service worker). Só os
**handles rastreados** persistem (`chrome.storage`). Ao trocar de handle, os payloads
crus em cache são **reprocessados** (`reprocessPayloads`) — por isso o filtro por escopo
deve acontecer no `parse`/`processCapture`, não em algo derivado.

---

## Stores

Fonte única por rede em `store.platforms.<id>`. Todos estendem o **`NormalizedStore`**:

```
NormalizedStore  { publications, commentsByPublication, engagementsByPublication, extra? }

XStore         = NormalizedStore + { tweets, favoriters, accountInfo, communityReplies }
InstagramStore = NormalizedStore + { publicationIdsByShortcode, visiblePublications,
                                     visibleComments }
LinkedInStore  = NormalizedStore + { extra: LinkedInExtra }   // reaction_breakdown,
                                                              // reposts, feedOrder, etc.
```

`extra` é o ponto de extensão tipado-na-borda: guarda a riqueza específica de uma rede
(ex.: o `reaction_breakdown`/`engagement_metrics` do LinkedIn) sem inchar o modelo comum.
A consolidação passa pelos helpers de `background/store.ts` (`storePublication`,
`storeComment`, `storeEngagement`), que escrevem **direto no store per-platform**.

---

## Protocolo de mensagens (`shared/messages.ts`)

**Página → content** (`window.postMessage`): `SOCIAL_CAPTURED`, `X_GRAPHQL_RESPONSE`.

**content → background** (`chrome.runtime.sendMessage`):

| Ação | Para quê |
|---|---|
| `CAPTURED_PAYLOAD` / `GRAPHQL_CAPTURED` | Payload interceptado (rede). |
| `PAGE_SESSION_STARTED` / `SET_ACTIVE_PROVIDER` | Ciclo de vida da aba/sessão. |
| `VISIBLE_PUBLICATIONS` / `VISIBLE_COMMENTS` | Itens raspados do DOM (Instagram). |

**popup → background:**

| Ação | Para quê |
|---|---|
| `SET_HANDLE`/`GET_HANDLE`, `SET_HANDLES`/`GET_HANDLES` | Definir/ler handles rastreados (limpa + reprocessa). |
| `GET_PUBLICATIONS` / `GET_TWEETS` | Conteúdo consolidado para exibição. |
| `GET_PLATFORM_DATA` / `GET_ALL_SUMMARY` | Dados/resumo por plataforma. |
| `GET_EXPORT` | JSON v3 completo para download. |
| `GET_ENDPOINTS` / `GET_ENDPOINT_PAYLOADS` / `GET_ALL_RAW` / `GET_RAW_PAYLOADS` | Payloads brutos (debug). |
| `CLEAR_ALL` | Limpar dados, preservando handles. |

---

## Export v3 (contrato externo)

`GET_EXPORT` retorna **schema v3**, consumido pelo He4rt Hub:

```json
{
  "schema_version": 3,
  "meta":         { "exported_at", "handles", "profiles" },
  "per_platform": { "x": {…}, "instagram": {…}, "linkedin": {…} },
  "unified":      { "summary": { "all": {…}, "by_platform": {…} } }
}
```

Estrutura completa, campo a campo, em **[`docs/export-format.md`](docs/export-format.md)**.
⚠️ Este formato é um **contrato externo** — ver invariantes abaixo.

---

## Invariantes e gates — INEGOCIÁVEL

1. **O export v3 é byte-compatível.** O **golden-master** (`test/__snapshots__/`) é o
   oráculo. Se o snapshot quebrar, **foi o código que regrediu o export** → conserte o
   código, **nunca** o snapshot.
2. **NUNCA** rode `bun test -u` / `--update-snapshots`. **NUNCA** edite `test/__snapshots__/`.
3. A riqueza do LinkedIn (`engagement_metrics`, `reaction_breakdown`) **não pode se perder**
   do export.
4. Antes de concluir qualquer mudança, rode os gates:

   ```
   bun test          # 0 fail; snapshots batem
   bun run typecheck # 0 erros
   bun run build     # "Extensão compilada em dist/chrome"
   ```

A camada de captura (`interceptor`/`content`) **não tem teste automático** — só se valida
carregando `dist/chrome` no Chrome e navegando. Mudanças nela exigem verificação no browser.

---

## CI — GitHub Actions

O workflow **`Validar extensão`** (`.github/workflows/validate-extension.yml`) roda em
todo PR e push para `main`. O job **`Validar build, testes e manifest`** executa:

```
checkout → setup-bun (.bun-version) → cache node_modules → install →
typecheck → validate (biome + manifest + testes) → build → package →
upload-artifact (só em push/main e workflow_dispatch)
```

Políticas de segurança aplicadas:

- **Actions pinadas por SHA** (não por tag) — exigido pelo persona `auditor` do zizmor.
- **`persist-credentials: false`** no checkout.
- **Concurrency group** com `cancel-in-progress` para evitar runs duplicados em PRs.
- **Dependabot** (`.github/dependabot.yml`): PRs automáticos semanais para actions e
  diários para npm, ambos com cooldown de 7 dias e timezone `America/Sao_Paulo`.

Para validar o workflow localmente: `uvx zizmor . --persona=auditor` (deve retornar 0
findings).

A versão do Bun usada no CI vem do arquivo `.bun-version` na raiz (mantido em sincronia
com `.mise.toml`).

---

## Onde mexer para…

| Quero… | Mexa em |
|---|---|
| **Adicionar uma rede** | `providers/meta.ts` → `providers/<id>/*` → `capture/registry.ts` → `controller.ts` (`BACKGROUND_PROVIDERS`) |
| Mudar como detecta/intercepta requisições | `providers/<id>/capture.ts` |
| Mudar a extração do payload | `providers/<id>/parser.ts` |
| Mudar como consolida no store | `providers/<id>/index.ts` (`processCapture`) + `background/store.ts` |
| **Mudar o JSON exportado** | `providers/<id>/index.ts` (`buildPlatformData`/`computeSummary`) + `controller.ts` (`buildExportJSON`) — ⚠️ golden-master |
| Adicionar/mudar uma mensagem | `shared/messages.ts` |
| Mudar modelos de domínio | `shared/domain.ts` |
| Mudar hosts/abas/manifest | `providers/meta.ts` |
| Modo de coleta (perfil/hashtag/…) | `providers/<id>/index.ts` (`scopeModes`) + `contract.ts` |
| Mudar o CI / workflow | `.github/workflows/validate-extension.yml` — actions devem ser pinadas por SHA |
| Atualizar versão do Bun | `.bun-version` (CI) + `.mise.toml` (local) — manter em sincronia |
| Configurar Dependabot | `.github/dependabot.yml` |

---

## Referências

- **[`docs/adr/0002-providers-plugaveis-ports-and-adapters.md`](docs/adr/0002-providers-plugaveis-ports-and-adapters.md)** — a decisão de arquitetura (ports & adapters + registry) e seus trade-offs.
- **[`CONTEXT.md`](CONTEXT.md)** — glossário do domínio (Provider, Publication, Engagement, Scope, Collection Target, Provenance…).
- **[`docs/export-format.md`](docs/export-format.md)** — estrutura completa do export v3.
- **[`docs/antes-depois-providers.html`](docs/antes-depois-providers.html)** — explainer visual da arquitetura (abrir via `file://`).
