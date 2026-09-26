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

Consumidores existentes (`from "../shared/domain"`) não quebram graços aos re-exports.
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
