# ADR 0002: Providers plugáveis via ports & adapters + registry

## Status

Aceito. Detalha a camada **extensão Chrome** do pipeline definido no [ADR-0001](./0001-coleta-social-via-extensao-openclaw.md).

## Contexto

A extensão nasceu só para X/Twitter e cresceu para Instagram e LinkedIn sem uma abstração de provider. O conhecimento específico de cada rede ficou **espalhado por 5 camadas** (`manifest`, `interceptor`, `content`, `background/controller`, `popup`), cada uma com seu próprio `if provider === ...`. Adicionar uma rede exige tocar nas 5 + estender um *dual-write* legado herdado da migração X→multi-plataforma.

Dois incômodos motivaram a reestruturação:

1. **Falta de SOLID** — código hardcoded de múltiplos providers em arquivos compartilhados.
2. **Rigidez de captura/filtro** — cada rede captura de um jeito diferente (rede, SSR `<script>`, DOM vivo, `<code>` BPR) e filtra por uma dimensão diferente (perfil, post, organização); no futuro, por hashtag/campanha. Não havia liberdade declarativa para isso.

Além disso, o modelo "normalizado" estava **meio-migrado**: `SocialMetrics` virou um tipo gordo (união de campos de todas as redes), `SocialPublicationType` idem, e o LinkedIn nem usava `SocialPublication` — tinha store próprio (`LinkedInStore`). Agregações cross-rede viravam cascatas manuais de `if`.

## Decisão

Adotar **ports & adapters** com **registry explícito**. O conhecimento de cada rede passa a viver em **um módulo coeso por provider**; as 5 camadas viram **engines genéricos** que iteram o registry.

```
            registry: PROVIDERS = [x, instagram, linkedin]   (array tipado, explícito)
                                   │
   ┌─────────────┐                ▼   src/providers/<nome>/
   │ manifest    │ ◄── meta ───┐    meta · capture · scope · parse · export (+ types/extra)
   │ interceptor │ ◄── capture ┤
   │ content     │ ◄── capture ┤    → 1 NormalizedStore por provider (MESMO shape)
   │ background  │ ◄ parse/scope┤    → export.build por provider (v3 byte-compatível)
   │ popup       │ ◄── meta ────┘
   └─────────────┘   adicionar provider = 1 pasta + 1 linha no registry; engines não mudam
```

Decisões específicas:

- **Facetas por contexto de execução.** Como a extensão roda em 4 contextos (MAIN, ISOLATED, service worker, popup), o contrato do Provider se divide em facetas (`capture`, `scope`, `parse`, `export`, `meta`). Cada bundle importa só a faceta que usa, via registries por contexto, para não inchar.
- **Captura = catálogo de estratégias declarativas.** O framework é dono do plumbing (patch de fetch/XHR, MutationObserver, debounce, dedup, postMessage, navegação SPA). O provider só compõe estratégias: `networkIntercept`, `ssrScriptScan`, `liveDomScrape`, `embeddedCodeScan`, e um `custom` como escape hatch. A captura é **passiva**.
- **`CapturedPayload` unificado por `surface`** (`network|ssr|dom|code`) — substitui 4 mensagens hoje separadas. Captura rotula bytes crus; `parse` (no SW) normaliza.
- **Scope é um seam.** Um Provider declara `modes`; o alvo ativo é um `CollectionTarget = {provider, mode, value}`. **Scope seleciona Publications; Comments/Engagements entram por Binding** com uma Publication selecionada ou com a Tracked Account; cada item carrega **Provenance** (`scope_mode`+`scope_value`). Só o modo `profile` é concreto agora; `hashtag`/`campaign` ficam prontos para entrar sem rearquitetar. Filtro roda no `parse`, preservando o reprocessamento de payloads crus ao trocar o alvo.
- **Store unificado.** Um `NormalizedStore` por provider (mesmo shape). `metrics` vira mapa aberto (`Partial<Record<MetricKey, number>>`); `type` vira conjunto universal pequeno + `raw_type` nativo; `Engagement` é generalizado (`kind: like|reaction|repost|comment`, `reaction_type?`, `target: publication|comment`). A riqueza específica de cada rede vai num `extra` **tipado pelo próprio provider**.
- **Export v3 congelado e byte-compatível.** O exporter central itera o registry; cada provider é dono do seu `export.build`. O `reaction_breakdown` do LinkedIn vive em `extra` (lossless) e o `engagement_metrics` é recomputado no `export.build`. O modelo de **eventos normalizados** do ADR-0001 (v4) fica **pronto para ligar** (provenance/source/confidence já entram no store), mas não é entregue agora.
- **Migração strangler em 5 fases**, com **golden-master primeiro**: snapshot do `GET_EXPORT` v3 a partir de fixtures (incluindo uma fixture de LinkedIn nova) antes de tocar em código; cada fase fecha verde contra ele. Os legacy flat stores são deletados na fase do store unificado.

## Alternativas consideradas

- **Federação total** (cada provider com seu próprio domínio) — rejeitada: o domínio de feed é comum o bastante (post/comentário/engajamento) e a federação perderia os rollups cross-rede que o produto quer (engajadores únicos entre redes).
- **Tipo único "gordo"** sem `extra` — rejeitada: é exatamente o estado atual. Mapa de `metrics` + `extra` tipado na borda preserva fidelidade sem poluir o core.
- **Entregar o v4 de eventos agora** — adiada: quebra a ingestão do Hub e é decisão de produto, não de refactor interno. Fica pronto-para-ligar.
- **`activeFetch`** (extensão disparando requests) — rejeitada por ora: navegação ativa é papel do Playwright (ADR-0001). O catálogo de captura é extensível se isso mudar. **→ Revisto no [ADR-0003](./0003-active-fetch-provider-devto.md):** o provider dev.to abre essa porta de forma contida (GET à própria conta logada, on-demand + AFK só na analytics).
- **Big-bang rewrite** — rejeitado: o strangler dá diff revisável por fase e permite bissecar regressões.
- **Auto-discovery de providers** — rejeitado: registry explícito é tipado e tree-shakeable; com um punhado de redes, auto-discovery só agrega magia.

## Consequências

**Positivas**

- Adicionar um provider = 1 pasta + 1 linha no registry; os engines param de conhecer redes.
- Store uniforme habilita agregações cross-rede e a futura projeção v4 de eventos.
- Liberdade de captura e de scope viram listas declarativas por provider.
- Golden-master trava o contrato v3 e a riqueza sagrada do LinkedIn.

**Negativas / custos**

- Facetas por contexto exigem registries por bundle (`capture`/`processing`/`ui`) para não inchar.
- A riqueza específica de provider fica `unknown` no core (`extra`), tipada só na borda do provider.
- Congelar o v3 significa que o modelo de eventos do ADR-0001 ainda não é entregue por esta mudança.
- Há um período transitório com lógica antiga e nova convivendo (inerente ao strangler).
