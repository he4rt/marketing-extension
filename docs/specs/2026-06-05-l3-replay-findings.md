# Findings — L3 Active Fetch: como preencher o payload de engajamento (RE ao vivo)

> Data: 2026-06-05 · Branch: `feat/linkedin-search` · Estende [spec L3](2026-06-03-linkedin-search-scope-l3.md) e [ADR-0004](../adr/0004-linkedin-search-scope-active-fetch.md)
> Origem: sessão de engenharia reversa ao vivo (fetch credenciado no contexto da página + leitura de rede).

Documento que cristaliza o que descobrimos sobre **por que o replay do L3 não preenchia o
payload** e **o que falta** para preencher `metrics` + `engagers` de cada post descoberto.
Evita re-descobrir tudo na próxima sessão.

---

## 1. Os root causes (em ordem de descoberta)

| # | Sintoma | Causa-raiz | Estado |
|---|---|---|---|
| 1 | calibração nunca colhia no SW | `harvestSignature` rodava no MAIN (interceptor); o SW lia outro singleton | ✅ commit `5b09971` |
| 2 | botão nunca habilitava / `uncalibrated` | split MAIN↔SW: realms/bundles separados | ✅ `5b09971` (harvest no SW; csrf via cookie) |
| 3 | replay real → HTTP 400 | `variables` sintético: param `urn:` (era `threadUrn:`), URN crua (precisa encodar), faltava `includeWebMetadata` | ⚠️ commit `860db61` (200, mas ver #4) |
| 4 | replay 200 mas **payload VAZIO** | `threadUrn:<activity>` devolve 200 com 0 elementos. Reactions/comments/reposts EXIGEM o **ugcPost** | 🔴 aberto |
| 5 | reações no post errado | parser associa por `parentUrn`; passivo usa ugcPost, post é keyed por activity → má-associação | 🔴 aberto (secundário) |

### Prova de #4 (fetch ao vivo, mesmo post)
```
threadUrn:urn:li:activity:7458263820537556992  → 200 · 0 elements · total 0   (VAZIO)
threadUrn:urn:li:ugcPost:7458263819488739328   → 200 · 10 elements · total 29 (REAL)
```
Os três endpoints sociais usam o **ugcPost**, confirmado no tráfego real da página:
- reactions: `threadUrn:urn:li:ugcPost:<id>`
- comments:  `socialDetailUrn:urn:li:fsd_socialDetail:(<ugcPost>,<ugcPost>,urn:li:highlightedReply:-)`
- reposts:   `targetUrn:urn:li:ugcPost:<id>`

> Encoding é obrigatório (colons crus → 400). O parser lê via `searchParams.get` (decoda), então
> os regex de URN continuam casando — não precisa mexer no parser por causa do encoding.

---

## 2. O elo que falta: `activity → ugcPost`

A busca SDUI entrega o **activity** URN (e às vezes o `share`), **nunca o ugcPost** (1 ugcPost
em 12 activities num `.har` real). O ugcPost vem do **update** do post:

- posts de **página administrada**: `voyagerFeedDashOrganizationalPageAdminUpdates` (admin-only);
- posts de **membro / geral**: `voyagerFeedDashUpdates` com `variables=(backendUrnOrNss:<activity>)`
  → **200, 119KB**, contém o update completo (counts + ugcPost).

### Fluxo-alvo
```
 PARA CADA activity descoberto:
   RESOLVE  voyagerFeedDashUpdates?backendUrnOrNss=<activity>   [200 ✓]
     ├─► numLikes / reactionTypeCounts / numComments  → metrics + reaction_breakdown
     └─► threadUrn (= ugcPost)                        → chave do fan-out
   FAN-OUT (com o ugcPost, NÃO o activity):
     ├─ socialDashReactions  threadUrn:<ugcPost>       → engagers.reactions
     ├─ socialDashComments   socialDetailUrn:<ugcPost> → engagers.comments
     └─ feedDashReshareFeed  targetUrn:<ugcPost>       → engagers.reposts
```

### Mapa campo-do-export → fonte
| Campo | Fonte | Hoje |
|---|---|---|
| `metrics.like_count` / `reaction_breakdown` / `comment_count` | search SDUI (parcial) **ou** resolve update | 1/3 posts |
| `engagers.reactions[]` | socialDashReactions (ugcPost) | precisa ugcPost |
| `engagers.comments[]` | socialDashComments (ugcPost) | precisa ugcPost + queryId |
| `engagers.reposts[]` | feedDashReshareFeed (ugcPost) | precisa ugcPost + queryId |

---

## 3. Os dois obstáculos abertos para implementar

### 3a. queryId do resolve não é colhido
`voyagerFeedDashUpdates.ca43379417f0bcc4a7e2031d6c063250` (valor de 2026-06-05) está no **JS da
página**, mas no permalink o update vem por **SSR** — nenhuma chamada client-side → o harvest
passivo não o pega. Hipótese a validar: ele dispara ao **rolar o feed normal** (uso natural) →
aí entra na calibração como os outros. (Decisão do dono: "colher do feed normal (testar)".)

### 3b. Resposta do resolve é **microSchema-comprimida**
Diferente dos endpoints sociais (que retornam `included[]` legível), o `voyagerFeedDashUpdates`
volta com `included: []` e os campos sob **chaves hasheadas** — os nomes legíveis (`threadUrn`,
`numLikes`, `reactionTypeCounts`) só existem em `meta.microSchema.types`. Extrair ugcPost+counts
exige **decodar o microSchema** (mapear hash→campo e remontar), o que é um componente novo e
frágil. Custo NÃO previsto quando se decidiu "tudo de uma vez".

---

## 4. Caminhos de implementação (a decidir)

1. **Decoder microSchema** — implementar o decode do `voyagerFeedDashUpdates` (resolve completo:
   counts + ugcPost). Mais poderoso, mais código/fragilidade.
2. **Achar um endpoint de resolve legível** — investigar `voyagerSocialDashSocialActivityCounts`
   (ou similar) por activity, que talvez devolva socialDetail (threadUrn) + counts SEM microSchema.
   Não testado ainda (faltava o queryId).
3. **Escopo He4rt via admin-updates** — para posts de páginas administradas, usar
   `OrganizationalPageAdminUpdates` (já visto, 183KB) — verificar se é microSchema também.
4. **Métricas-only primeiro** — se o resolve for caro, ao menos `reaction_breakdown`+counts já
   "desbloqueiam o Hub"; engagers (listas) viram fase B.

## 5. Commits desta feature
- `5b09971` feat: destrava calibração MAIN→SW + dry-run + logs
- `860db61` fix: shape Voyager (param/encoding/includeWebMetadata) — **incompleto**: 200 mas vazio
  sem o ugcPost (ver #4). Manter no histórico; o fix completo troca activity→ugcPost via resolve.

## 6. Ferramentas
- `scripts/linkedin/05-voyager-shapes.py` — extrai shapes Voyager de um `.har`.
- RE ao vivo: `mcp__claude-in-chrome__javascript_tool` (fetch credenciado no contexto da página)
  + `read_network_requests`. ⚠️ ToS: cada fetch ORIGINA tráfego — fazer só com autorização do dono.

---

## 7. Fluxo USER/SYSTEM do aprofundamento L3 (alvo)

```
 USUÁRIO                                   EXTENSÃO (service worker)
  │                                            │
  │  📱 busca "#laraveldaysp"                  │
  │ ─────────────────────────────────────────►│  SDUI → N posts (activity URN) · metrics PARCIAIS
  │                                            │  [calib] clientVersion ✓ (queryId_* ainda não)
  │                                            │
  │  📱 abre 1 post  /  rola o feed normal     │
  │ ─────────────────────────────────────────►│  [calib] queryId_reactions/comments/reposts ✓
  │                                            │          queryId_updates (resolve) ✓ ⟵ a validar (3a)
  │    ┌────────────────────────────────────┐  │
  │    │ Aprofundar engajamento (L3)  ✓ on  │  │  isCalibrated() == true → botão habilita
  │    │ ☐ enviar de verdade                │  │
  │    └────────────────────────────────────┘  │
  │                                            │
  │  ☑ enviar de verdade  +  👆 Aprofundar     │
  │ ─────────────────────────────────────────►│  refreshAuth: csrf ← cookie JSESSIONID
  │                                            │  PARA CADA activity (cap 5):
  │                                            │   ① resolve(activity) → ugcPost + counts
  │                                            │       └ metrics ← numLikes/reactionTypeCounts/numComments
  │                                            │   ② reactions(ugcPost) → engagers.reactions
  │                                            │   ③ comments(ugcPost)  → engagers.comments
  │                                            │   ④ reposts(ugcPost)   → engagers.reposts
  │                                            │  merge SEM rebaixar (preserveMetrics)
  │                                            │  [L3] replay … status=200 · actorsCaptured++
  │    "✓ 5/5 aprofundados · 42 Actors"        │
  │ ◄──────────────────────────────────────────│
  │  👆 Exportar Dados → payload COMPLETO       │
  │ ─────────────────────────────────────────►│  metrics + engagers preenchidos por post
```

---

## 8. Plano de implementação (próxima sessão)

Pré-requisito de RE (fazer 1º, ao vivo, com autorização do dono): **resolver o item 3** —
ou confirmar um endpoint de resolve LEGÍVEL (caminho 4.2), ou aceitar o decoder microSchema (4.1).
Sem isso travado, o resto não fecha.

1. **Seam de resolve.** `ActiveFetchFacet` ganha `resolveTarget(target, calib) → { ugcPost, counts }`
   (opcional; rede só na faceta do provider, como `refreshAuth`). LinkedIn: GET
   `voyagerFeedDashUpdates(backendUrnOrNss:<activity>)`.
2. **Parser do resolve.** Novo módulo `providers/linkedin/active-fetch/resolve-parser.ts` extrai
   `threadUrn`(ugcPost) + `reactionTypeCounts`/`numLikes`/`numComments` — lidando com microSchema
   se for o caso (3b). PURO, testável com fixture.
3. **Scheduler.** Antes do fan-out de um alvo, chama `resolveTarget`; injeta `ugcPost` no alvo e
   grava as `metrics`/`reaction_breakdown` no store (preenche TODOS os posts, não só os da busca).
4. **endpoints.ts.** `buildVariables` passa a usar o **ugcPost** do alvo resolvido (não o activity).
   Hoje usam `target.activityUrn` → trocar por `target.ugcPost`.
5. **queryId_updates.** Adicionar `voyagerFeedDashUpdates` à calibração (`QUERY_ID_PREFIX_TO_FIELD`),
   colhido do feed normal (validar 3a). `isCalibrated` passa a exigir o queryId do resolve também.
6. **Bug #5 (má-associação).** Quando a captura passiva de reactions vier com `parentUrn` = ugcPost,
   mapear de volta para o activity do post (via o ugcPost que o resolve guardou) antes de associar.
7. **Gates + HITL.** Unit tests (resolve-parser, scheduler com resolve, endpoints com ugcPost) +
   validação no browser: 1 busca → Aprofundar real → export com metrics+engagers em TODOS os posts.
   Golden-master intacto (o L3 não roda no teste de captura passiva).

> Política mantida: dry-run por padrão, cap 5 alvos, parada graciosa, csrf via cookie (nunca em msg).
