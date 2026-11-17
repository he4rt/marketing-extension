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
