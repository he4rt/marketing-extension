# Plano: Candidatos 1 e 2 — Architecture Review

## Visão geral

Dois refactors **paralelos** com boundary clara (Candidate 1 mexe em controller/contract/providers; Candidate 2 mexe em domain.ts + providers/types). Cada um mergeável sem bloquear o outro.

---

## Candidate 1: Decompose controller into dispatch registry

### Meta
- `handleRuntimeMessage` (802 linhas) → dispatch genérico (~200 linhas) + handlers por provider no contrato
- Eliminar leakage de Instagram/LinkedIn do controller genérico

### Decisões tomadas (grill session)

| Decisão | Escolha | Alternativa rejeitada |
|---------|---------|----------------------|
| Separação genéricos vs provider | Genéricos inline, provider-spec via contract | Registry única pra tudo |
| Como enriquecer contrato | Métodos opcionais em `BackgroundProviderFacet` | Registry separada de message handlers |
| reprocessPayloads | Hooks granulares (`restoreVisibleData`, `reprocessVisible`) | Provider inteiro controla reprocess |
| GET_PLATFORM_DATA | Provider retorna own shape, `unknown` | Normalizar retorno |
| GET_ALL_SUMMARY | `computePopupSummary(store)` por provider | Iteração manual no controller |
| Ordem | Paralelo com Candidate 2 | Sequencial |

### Passos

#### Passo 1: Estender `BackgroundProviderFacet` (contract.ts)

Adicionar métodos opcionais:

```ts
export type BackgroundProviderFacet = {
  id: SocialProvider;
  processCapture: CaptureProcessor;
  scopeModes: ScopeMode[];

  // NOVOS — opcionais
  buildPlatformData?(store: BackgroundStore): unknown;
  computePopupSummary?(store: BackgroundStore): {
    content_count: number;
    engager_count: number;
  };
  restoreVisibleData?(store: BackgroundStore, saved: unknown): void;
  reprocessVisibleComments?(store: BackgroundStore, saved: unknown): void;
  buildExportPlatformData?(store: BackgroundStore): unknown;
  computeExportSummary?(store: BackgroundStore): unknown;
};
```

**Arquivos:** `src/providers/contract.ts`

#### Passo 2: Implementar métodos nos providers

Cada provider implementa os métodos que lhe cabem:

**Instagram** (`src/providers/instagram/index.ts`):
- `buildPlatformData(store)` — extração de `GET_PLATFORM_DATA` instagram branch (linhas 676-688)
- `computePopupSummary(store)` — extração de `GET_ALL_SUMMARY` instagram branch (linhas 742-745)
- `restoreVisibleData(store, saved)` — restaura `visiblePublications` (linha 241)
- `reprocessVisibleComments(store, saved)` — reprocessa visibleComments (linhas 275-288)
- `buildExportPlatformData(store)` — chama `buildPlatformDataInstagram` (já existe)
- `computeExportSummary(store)` — chama `computeSummaryInstagram` (já existe)

**LinkedIn** (`src/providers/linkedin/index.ts`):
- `buildPlatformData(store)` — extração de `GET_PLATFORM_DATA` linkedin branch (linhas 690-721)
- `computePopupSummary(store)` — extração de `GET_ALL_SUMMARY` linkedin branch (linhas 748-760)
- `buildExportPlatformData(store)` — chama `buildPlatformDataLinkedin` (já existe)
- `computeExportSummary(store)` — chama `computeSummaryLinkedin` (já existe)

**X** (`src/providers/x/index.ts`):
- `buildPlatformData(store)` — extração de `GET_PLATFORM_DATA` x branch (linhas 662-674)
- `computePopupSummary(store)` — extração de `GET_ALL_SUMMARY` x branch (linhas 734-739)
- `buildExportPlatformData(store)` — chama `buildPlatformDataX` (já existe)
- `computeExportSummary(store)` — chama `computeSummaryX` (já existe)

**Arquivos:** `src/providers/instagram/index.ts`, `src/providers/linkedin/index.ts`, `src/providers/x/index.ts`

#### Passo 3: Refatorar `handleRuntimeMessage`

Controller vira dispatch genérico. Cada bloco provider-specific é substituído por chamada ao contrato:

```ts
// GET_PLATFORM_DATA — antes: 60 linhas com if/else por provider
// Depois:
if (request.action === "GET_PLATFORM_DATA") {
  const handler = BACKGROUND_PROVIDERS[request.provider]?.buildPlatformData;
  if (!handler) return { type: "unknown", publications: [], ... };
  return handler(store);
}

// GET_ALL_SUMMARY — antes: 40 linhas iterando manualmente
// Depois:
if (request.action === "GET_ALL_SUMMARY") {
  const byPlatform: Record<string, { content_count: number; engager_count: number }> = {};
  for (const p of SOCIAL_PROVIDERS) {
    const summary = BACKGROUND_PROVIDERS[p].computePopupSummary?.(store);
    if (summary) byPlatform[p] = summary;
  }
  // rollup cross-provider permanece no controller (é genérico)
  const total = Object.values(byPlatform).reduce((s, p) => s + p.content_count, 0);
  const allEngagers = new Set(/* ... aggregate engagers ... */);
  return { total_content: total, total_engagers: allEngagers.size, by_platform: byPlatform, lastUpdated: store.lastUpdated };
}

// VISIBLE_PUBLICATIONS — antes: 35 linhas Instagram
// Depois:
if (request.action === "VISIBLE_PUBLICATIONS") {
  BACKGROUND_PROVIDERS[request.provider]?.handleVisibleData?.(store, request);
  return { success: true };
}

// reprocessPayloads — antes: 70 linhas com lógica Instagram hardcoded
// Depois:
function reprocessPayloads(store: BackgroundStore) {
  const savedVisible = {};
  for (const p of SOCIAL_PROVIDERS) {
    savedVisible[p] = BACKGROUND_PROVIDERS[p].saveVisibleState?.(store);
  }
  // ... clear + reprocess payloads (genérico) ...
  for (const p of SOCIAL_PROVIDERS) {
    BACKGROUND_PROVIDERS[p].restoreVisibleData?.(store, savedVisible[p]);
    BACKGROUND_PROVIDERS[p].reprocessVisibleComments?.(store, savedVisible[p]);
  }
}

// buildExportJSON — antes: itera platforms manualmente
// Depois:
function buildExportJSON(store: BackgroundStore): ExportJSON {
  return {
    per_platform: {
      x: BACKGROUND_PROVIDERS.x.buildExportPlatformData!(store),
      instagram: BACKGROUND_PROVIDERS.instagram.buildExportPlatformData!(store),
      linkedin: BACKGROUND_PROVIDERS.linkedin.buildExportPlatformData!(store),
    },
    unified: {
      summary: computeUnifiedSummary(store), // novo helper
    },
    // ... meta ...
  };
}
```

**Arquivos:** `src/background/controller.ts`

#### Passo 4: Extrair `reprocessPayloads` auxiliares

Funções auxiliares que ficam no controller (genéricas):
- `clearNormalizedData(store)` — já existe, sem mudança
- `clearDisplayedData(store)` — já existe, sem mudança
- Novo: `saveVisibleStates(store)` — itera providers, chama `saveVisibleState`
- Novo: `restoreVisibleStates(store, saved)` — itera providers, chama `restoreVisibleData`

**Arquivos:** `src/background/controller.ts`

#### Passo 5: Mover `emptyXStore`/`emptyInstagramStore`/`emptyLinkedInStore`

Estas funções (linhas 44-85) são usadas por `createStore` e `clearNormalizedData`. Movê-las para os respectivos providers:
- `emptyXStore` → `providers/x/index.ts` (exportar)
- `emptyInstagramStore` → `providers/instagram/index.ts` (exportar)
- `emptyLinkedInStore` → `providers/linkedin/index.ts` (exportar)

Controller importa de providers.

**Arquivos:** `src/background/controller.ts`, `src/providers/x/index.ts`, `src/providers/instagram/index.ts`, `src/providers/linkedin/index.ts`

#### Passo 6: Atualizar golden-master e background tests

Rodar `bun test` e `bun run typecheck` para garantir que nada quebra. O golden-master (`test/golden-master.test.ts`) congela o shape do export v3 — se passar, o refactor está correto.

**Arquivos:** nenhum (verificação)

---

## Candidate 2: Split domain.ts into core + provider-specific modules

### Meta
- `shared/domain.ts` (496 linhas) → `shared/domain/core.ts` (~170 linhas) + `providers/<id>/types.ts`
- Backward compat via re-exports em `shared/domain/index.ts`

### Decisões tomadas (grill session)

| Decisão | Escolha | Alternativa rejeitada |
|---------|---------|----------------------|
| Onde vivem tipos provider | `providers/<id>/types.ts` | `providers/<id>/domain.ts` (2 arquivos por provider) |
| Split exato | Core: Social*, Normalized*, Background*, Export* genéricos | — |
| Backward compat | Re-exports em `domain/index.ts` | Quebra imports de uma vez |

### Classificação dos tipos

#### Core (`shared/domain/core.ts`) — ~170 linhas
- `SocialProvider`, `SocialActor`, `SocialPublicationType`, `SocialMetrics`, `SocialPublication`, `SocialComment`, `SocialEngagement`
- `TrackedProfile`, `EndpointStore`, `NormalizedStore`, `BackgroundStore`, `ScopeProvenance`
- `ExportComment`, `ExportV3Meta`, `ExportSummaryAll`, `ExportV3Summary`, `ExportV3Unified`, `ExportJSON`
- `ExportV3PerPlatform` (junta todos — contrato de export)

#### X-specific (`providers/x/types.ts`) — ~90 linhas
- `TweetType`, `TweetAuthor`, `TweetMetrics`, `TweetData`, `AccountInfo`, `Favoriter`
- `ExportV3PlatformX`, `ExportSummaryX`
- `XStore`

#### Instagram-specific (`providers/instagram/types.ts`) — ~30 linhas
- `InstagramStore`, `ExportInstagramPost`, `ExportV3PlatformInstagram`, `ExportSummaryInstagram`

#### LinkedIn-specific (`providers/linkedin/types.ts`) — ~110 linhas
- `LinkedInPostData`, `LinkedInEngagerStore`, `LinkedInRepostStore`, `LinkedInCommentStore`, `LinkedInExtra`, `LinkedInStore`
- `LinkedInReactionUser`, `LinkedInRepostEntry`, `LinkedInEngagementMetrics`
- `ExportLinkedInPost`, `ExportV3PlatformLinkedin`, `ExportSummaryLinkedin`

### Passos

#### Passo 1: Criar `shared/domain/core.ts`

Mover os tipos core de `domain.ts` para `core.ts`. Imports internos ajustados (ex: `NormalizedStore` referencia `SocialPublication` que agora está no mesmo arquivo).

**Arquivos:** `src/shared/domain/core.ts` (novo)

#### Passo 2: Criar `providers/x/types.ts`

Mover `TweetType`, `TweetAuthor`, `TweetMetrics`, `TweetData`, `AccountInfo`, `Favoriter`, `ExportV3PlatformX`, `ExportSummaryX`, `XStore` de `domain.ts`.

`XStore` referencia `TweetData` e `SocialPublication` — importa de `domain/core.ts`.

**Arquivos:** `src/providers/x/types.ts` (novo)

#### Passo 3: Criar `providers/instagram/types.ts`

Mover `InstagramStore`, `ExportInstagramPost`, `ExportV3PlatformInstagram`, `ExportSummaryInstagram`.

`InstagramStore` referencia `SocialPublication`, `SocialComment`, `SocialEngagement`, `SocialActor` — importa de `domain/core.ts`.

**Arquivos:** `src/providers/instagram/types.ts` (novo)

#### Passo 4: Criar `providers/linkedin/types.ts`

Mover todos os tipos LinkedIn. Referenciam `SocialActor`, `SocialComment`, `SocialPublication`, `NormalizedStore`, `TrackedProfile`, `ExportComment` — importam de `domain/core.ts`.

**Arquivos:** `src/providers/linkedin/types.ts` (novo)

#### Passo 5: Criar `shared/domain/index.ts` com re-exports

```ts
// Re-exports core
export * from "./core";

// Re-exports provider-specific (backward compat)
export * from "../../providers/x/types";
export * from "../../providers/instagram/types";
export * from "../../providers/linkedin/types";
```

**Arquivos:** `src/shared/domain/index.ts` (novo)

#### Passo 6: Transformar `shared/domain.ts` em barrel

Substituir o conteúdo atual de `domain.ts` por:

```ts
export * from "./domain/index";
```

Ou simplesmente renomear `domain.ts` → `domain/old.ts` e criar o barrel. Imports existentes (`from "../shared/domain"`) continuam funcionando.

**Arquivos:** `src/shared/domain.ts` (substituído por barrel)

#### Passo 7: Verificar imports

40 arquivos importam de `shared/domain`. Com re-exports, nenhum quebra. Mas vale verificar:
- `bun run typecheck`
- `bun test`

**Arquivos:** nenhum (verificação)

---

## ADR 0005: Controller dispatch registry

```markdown
# ADR 0005: Controller message dispatch via enriched provider contract

## Status

Proposto.

## Contexto

`handleRuntimeMessage` em `src/background/controller.ts` é uma função god de 802 linhas
com ~15 blocos if/else. Providers específicos (Instagram visible data, LinkedIn calibration,
GET_PLATFORM_DATA branching) vivem no controller genérico. Adicionar suporte a um novo
provider exige tocar no controller em múltiplos pontos.

O projeto já tem `BACKGROUND_PROVIDERS` registry para capture processing
(`processCapture`), mas o message handler não usa o mesmo padrão.

## Decisão

Estender `BackgroundProviderFacet` com métodos opcionais que cada provider implementa:

- `buildPlatformData(store)` — dados pro popup
- `computePopupSummary(store)` — content_count + engager_count
- `restoreVisibleData(store, saved)` — restaura estado visível no reprocess
- `reprocessVisibleComments(store, saved)` — reprocessa comments visíveis
- `buildExportPlatformData(store)` — dados pro export v3
- `computeExportSummary(store)` — summary pro export v3

O controller genérico itera o registry em vez de hardcodar branches por provider.
Handlers genéricos (SET_ACTIVE_PROVIDER, GET_HANDLE, CLEAR_ALL) permanecem inline
porque são curtos e não crescem por provider.

## Alternativas consideradas

- **Registry separada de message handlers** — rejeitada: fragmenta o contrato do provider.
  Provider = unidade coesa; um arquivo, uma interface.
- **Provider inteiro controla reprocessPayloads** — rejeitada: perde granularidade.
  Hooks específicos (restore/reprocess) são mais composáveis.
- **Uniformizar tudo numa registry só** — rejeitada: handlers genéricos são triviais
  (5-10 linhas) e não beneficiam de dispatch.

## Consequências

**Positivas**
- Adicionar provider = implementar métodos no contrato + registrar no BACKGROUND_PROVIDERS
- Controller encolhe de ~802 para ~200 linhas (dispatch genérico)
- Leakage de Instagram/LinkedIn eliminado do controller
- Hooks testáveis isoladamente por provider

**Negativas / custos**
- BackgroundProviderFacet cresce (6 métodos novos, todos opcionais)
- Período transitório com lógica antiga e nova convivendo
- Testes existentes (background.test.ts, golden-master.test.ts) precisam passar verde
```

---

## ADR 0006: Domain types split

```markdown
# ADR 0006: Split domain.ts into core + provider-specific type modules

## Status

Proposto.

## Contexto

`src/shared/domain.ts` (496 linhas) concentra tipos de 4 domínios:
tipos core (Social*, Normalized*, Background*, Export*), X (TweetData, Favoriter),
Instagram (InstagramStore, ExportInstagramPost) e LinkedIn (LinkedInPostData,
LinkedInExtra, LinkedInStore). ~55% dos tipos são provider-specific.

Mudar um tipo LinkedIn exige tocar no mesmo arquivo que contém tipos X.
Provider types não co-locam com provider logic.

## Decisão

Split em:
- `shared/domain/core.ts` — tipos shared (Social*, NormalizedStore, BackgroundStore, Export*)
- `providers/<id>/types.ts` — tipos provider-specific por rede
- `shared/domain/index.ts` — barrel com re-exports para backward compat

Consumidores existentes (`from "../shared/domain"`) não quebram graças aos re-exports.
Migração para imports diretos (`from "../../providers/x/types"`) é opcional e gradual.

## Alternativas consideradas

- **`providers/<id>/domain.ts`** — rejeitada: dois arquivos de domínio por provider é
  overkill. `types.ts` concentra tudo.
- **Quebra de imports de uma vez** — rejeitada: 40 arquivos importam de `shared/domain`.
  Re-exports são baratos e evitam merge conflicts.
- **Manter monolito** — rejeitada: 496 linhas com 55% provider-specific é a causa
  raiz do acoplamento.

## Consequências

**Positivas**
- Provider types co-locam com provider logic
- Imports resolvem para módulos menores (tree-shakeable)
- Deletion test: core.ts sobrevive, provider types somem com o provider
- Novos providers não incham o shared file

**Negativas / custos**
- Barrel de re-exports adiciona uma camada de indireção
- Período transitório com ambos os paths funcionando
- `ExportV3PerPlatform` fica em core (junta todos) — acoplamento mínimo necessário
```

---

## Ordem de execução

### Workstream A (Candidate 1 — controller dispatch)
1. Estender `contract.ts`
2. Implementar métodos nos 3 providers
3. Refatorar `handleRuntimeMessage`
4. Mover empty*Store para providers
5. Verificar testes

### Workstream B (Candidate 2 — domain split)
1. Criar `domain/core.ts`
2. Criar `providers/x/types.ts`
3. Criar `providers/instagram/types.ts`
4. Criar `providers/linkedin/types.ts`
5. Criar `domain/index.ts` barrel
6. Substituir `domain.ts` por barrel
7. Verificar testes

### Validação final
- `bun run typecheck`
- `bun test`
- `bun run lint`
- Golden-master snapshot deve passar inalterado
