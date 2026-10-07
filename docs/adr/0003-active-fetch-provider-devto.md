# ADR 0003: Active Fetch — coleta que origina requests (provider dev.to)

## Status

Aceito. **Emenda parcial ao [ADR-0002](./0002-providers-plugaveis-ports-and-adapters.md)**, que
cravou *"a captura é passiva"* e **rejeitou `activeFetch`** ("navegação ativa é papel do
Playwright… o catálogo de captura é extensível se isso mudar"). Isso mudou — ver Contexto.
A regra de ouro do projeto passa de *"só observa"* para *"passivo por padrão; Active Fetch é
exceção explícita, declarada por provider"*.

## Contexto

Os três providers de hoje (X, Instagram, LinkedIn) coletam por **Passive Capture**: a extensão
só observa o que a página já carrega enquanto você navega. Esse modelo não alcança o **dev.to**,
porque os dados que importam **não estão na navegação normal**:

1. **Performance do autor** (page_views, read_time, follows, breakdown de reações por dia) só
   sai do endpoint oficial `GET /api/analytics/historical?article_id=`, autenticado por
   **api-key** e **escopado à conta dona da key**. A página `/stats` apenas *renderiza* o que
   esse endpoint devolve via fetch — não há SSR/`<script>` estável pra raspar passivamente, e
   abrir `/stats` de cada artigo à mão não escala.
2. **Engagement** ("quem reagiu" — Actor + tipo + data, o sinal que o `CONTEXT.md` chama de mais
   valioso) só existe na lista de Reactions History; a forma estruturada é a rota interna
   `GET /reactions?article_id=`, autenticada pela **sessão** (cookie vivo).

Ambas exigem **originar** requests a partir do background. O ADR-0002 destinava navegação ativa
ao Playwright (ADR-0001), mas para o dev.to isso seria infra desproporcional: a api-key e o
cookie de sessão **já vivem no navegador logado do usuário**. Levantar Playwright pra reusar uma
credencial que a extensão já tem em mãos não se paga. O ADR-0002 previu essa porta ("se isso
mudar") — este ADR a abre, de forma contida.

## Decisão

Introduzir **Active Fetch** como um **seam de primeira classe**, sem inchar as camadas genéricas
nem mexer no contrato passivo existente.

```
 networkIntercept  MAIN       reage ao tráfego da página      ┐
 ssr/code/scrape   ISOLATED   lê o que a página renderizou    ├─ Passive Capture (inalterado)
 ── NOVO ──                                                   ┘
 activeFetch       BACKGROUND ORIGINA o request (service worker) ── Active Fetch
```

- **Faceta `activeFetch` declarada pelo provider.** Como toda captura no ADR-0002, é
  declarativa: o provider DECLARA seus endpoints, o esquema de auth de cada um
  (`api-key` no header | `cookie` via `credentials:"include"`) e como enumerar os alvos
  (dev.to: `GET /api/articles/me`). Registrada num registry próprio, paralelo a
  `CAPTURE_FACETS`/`BACKGROUND_PROVIDERS`. As camadas genéricas continuam sem `if` por rede.
- **O resultado entra no MESMO `processCapture(store, capture)`.** Um Active Fetch é só mais uma
  *origem de payload*: produz um envelope de captura sintético que o `parser`/`index` do provider
  normaliza igual a uma captura passiva. Parser, store e export ficam **idênticos em forma** — o
  golden-master v3 nem sente (dev.to é aditivo: nova chave em `per_platform`).
- **Gatilho on-demand + AFK assimétrico.** O botão "Coletar" dispara tudo com o usuário presente.
  Um `chrome.alarms` **diário** atualiza **só a analytics por api-key** (AFK-safe, não depende de
  sessão). O Engagement por `/reactions` (cookie) **não** roda no AFK — falha graciosamente quando
  a sessão expira; a analytics segue.
- **dev.to é um Background-only Provider.** Coleta só por Active Fetch, então **não injeta content
  script**. `ProviderMeta` passa a separar `matches` (gera content scripts) de `hostPermissions`
  (gera permissão de fetch); dev.to declara só `hostPermissions`.
- **Credencial.** A api-key é digitada na aba Config e persiste em `chrome.storage.local`
  (mesmo mecanismo dos handles). É um **segredo em texto puro no disco** — aceito para uma
  ferramenta pessoal de membro; registrado como risco conhecido (ver Consequências).
- **Escopo single-tenant.** v1 cobre o **usuário logado** (a conta dona da api-key + cookies).
  "Todos os membros" é multi-credencial e fica fora desta decisão.

## Alternativas consideradas

- **Manter passivo + abrir cada `/stats` à mão** — rejeitada: não escala, e nem alcança a
  analytics (que vem por fetch da própria página, sem SSR raspável estável).
- **Fazer o Active Fetch no Playwright/OpenClaw (ADR-0001)** — rejeitada por ora: a api-key e o
  cookie já estão no navegador logado; levantar Playwright só pra reusá-los é infra
  desproporcional. Continua sendo o caminho se virar multi-tenant/headless.
- **Capturar e persistir headers de sessão pra replay** (o pedido original) — rejeitada: no MV3
  um `fetch` credenciado reanexa o cookie httpOnly automaticamente enquanto logado; persistir
  header só seria preciso se houvesse um header não-cookie obrigatório (CSRF/anti-bot), que não
  se confirmou. Construir o mínimo.
- **Subsistema `src/sync/` dev.to-específico** — rejeitada: reintroduziria código por-rede num
  lugar novo, ferindo a regra do ADR-0002 ("camadas genéricas não conhecem redes").
- **AFK pleno nas duas fontes** — rejeitada: o Engagement depende de sessão e falharia em
  silêncio no background; só a analytics é honestamente AFK.

## Consequências

**Positivas**
- dev.to entra como **1 pasta + registros**, igual aos outros, reusando `processCapture`/parser/
  store/export. O export v3 permanece byte-compatível (aditivo).
- Active Fetch fica **declarativo e contido**: GET, endpoints da própria conta logada, on-demand
  por padrão e AFK só na analytics — a exceção à regra de ouro é estreita e auditável.
- Desacoplar `matches`↔`hostPermissions` habilita futuros providers background-only (APIs).

**Negativas / custos**
- **Postura de ToS** muda: a extensão deixa de só observar e passa a originar requests
  autenticados. Mitigado por restringir a GET, à própria conta, e com throttle sequencial para
  respeitar rate-limit.
- **Segredo no disco:** a api-key em `chrome.storage.local` é texto puro, legível por quem tiver
  acesso ao perfil/DevTools. Aceito para uso pessoal; reavaliar se a base de usuários crescer.
- **AFK frágil para Engagement:** "quem reagiu" só atualiza on-demand ou enquanto logado — não há
  garantia de frescor em background.
- Surge um **scheduler no background** (enumerar → fan-out por artigo com delay) que não existia;
  é a primeira lógica de orquestração de requests da extensão.
