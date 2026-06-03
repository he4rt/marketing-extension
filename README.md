# He4rt Analytics

Extensão de navegador que **captura passivamente** dados de engajamento de redes sociais
enquanto você navega e exporta um **JSON estruturado** pronto para ingestão no
**He4rt Hub** (Laravel) — quem interage com o conteúdo da comunidade, como os posts
performam e onde o crescimento está acontecendo.

Multi-plataforma desde o início: **X/Twitter**, **Instagram** e **LinkedIn**, com uma
arquitetura plugável onde adicionar uma rede é basicamente criar uma pasta.

## O Problema

As redes sociais não dão aos gestores de comunidade os dados de que precisam. Você vê
curtidas e visualizações item por item, mas não consegue:

- Exportar engajamento em massa, de forma estruturada
- Ver quais membros interagem consistentemente com o conteúdo
- Rastrear comentários, respostas e reações ao longo de todos os posts
- Cruzar quem engaja com o banco de dados da comunidade
- Consolidar tudo isso **através de várias redes** num formato único

Esta extensão roda em background enquanto você navega, observa as respostas que o próprio
app já carrega, e consolida tudo num JSON limpo pronto para o banco.

## Plataformas suportadas

| Rede | Status | O que captura |
| --- | --- | --- |
| **X / Twitter** | ✅ Validado | Tweets do perfil, métricas, replies da comunidade, curtidores |
| **Instagram** | ✅ Validado | Publicações, métricas, comentários (árvore) e curtidores |
| **LinkedIn** | 🚧 Em estabilização | Posts, reações (com breakdown), reposts, comentários e métricas de engajamento |

> O processamento e o export do LinkedIn estão prontos e cobertos por testes; a camada de
> captura no browser está sendo estabilizada.

## Como Funciona

```
  Rede social (navegador)        Extensão                       He4rt Hub (Laravel)
  ┌─────────────────┐     ┌──────────────────────┐          ┌──────────────────────┐
  │                 │     │  interceptor (MAIN)  │          │   Endpoint da API    │
  │  Você navega    │────►│  patch em fetch/XHR  │          │   POST /analytics    │
  │  normalmente    │     │  por estratégia       │          │                      │
  │                 │     ├──────────────────────┤          │   Ingere JSON v3:    │
  │  As requisições │     │  content (ISOLATED)  │          │   - conteúdo         │
  │  acontecem      │     │  ponte + scan de DOM │          │   - engajadores      │
  │  como sempre    │     ├──────────────────────┤          │   - resumo unificado │
  │                 │     │  background (worker) │          │                      │
  └─────────────────┘     │  filtra por handle   │          └──────────┬───────────┘
                          │  consolida · dedup   │                     │
                          │  exporta JSON v3     │─────────────────────┘
                          └──────────────────────┘
```

Por que dois content scripts? A CSP restrita dos sites bloqueia scripts inline.
O **interceptor** roda no mundo `MAIN` (contexto da página) para acessar `window.fetch`;
o **content** roda no mundo `ISOLATED` (contexto da extensão) para usar `chrome.runtime`.
Eles se comunicam via `window.postMessage`.

## Instalação

1. Clone o repositório
2. Rode `bun install`
3. Rode `bun run build`
4. Abra `chrome://extensions/`
5. Ative o **Modo desenvolvedor**
6. Clique em **Carregar sem compactação** e selecione a pasta `dist/chrome`

## Uso

### Capturando

1. Clique no ícone da extensão
2. Na aba da rede, informe o handle/perfil que quer rastrear e confirme
3. Abra esse perfil na rede correspondente
4. Navegue/role normalmente — a extensão captura passivamente
5. Para curtidores/reações: abra a lista de quem curtiu e role
6. Acompanhe no popup o conteúdo capturado com as métricas

### Exportando

Clique em **Exportar JSON** para baixar o arquivo estruturado (schema v3):

```json
{
  "schema_version": 3,
  "meta": {
    "exported_at": "2026-06-02T12:00:00.000Z",
    "handles": { "x": "@He4rtDevs", "instagram": "he4rtdevs" },
    "profiles": { "x": { "...": "..." } }
  },
  "per_platform": {
    "x":         { "content": [ "...tweets..." ], "engagers": { "likes_by_tweet": {}, "replies": [] } },
    "instagram": { "content": [ "...posts com engagers.likes/comments..." ] },
    "linkedin":  { "content": [ "...posts com reactions/reposts/comments + engagement_metrics..." ] }
  },
  "unified": {
    "summary": {
      "all": { "total_content": 15, "total_likes": 500, "total_comments": 30, "unique_engagers": 42 },
      "by_platform": { "x": { "...": "..." }, "instagram": { "...": "..." } }
    }
  }
}
```

A estrutura completa, campo a campo (incluindo `engagement_metrics` e `reaction_breakdown`
do LinkedIn), está em **[`docs/export-format.md`](docs/export-format.md)**.

## Arquitetura

Pipeline de captura em camadas (MAIN → ISOLATED → service worker → popup) sobre um
**modelo de providers plugável**: cada rede é uma pasta coesa em `src/providers/<rede>/`
(`parser` · `capture` · `index`), registrada em três pontos. As camadas genéricas não
conhecem redes individuais — adicionar uma rede ≈ uma pasta + três registros.

```
src/
├── interceptor/   Motor de rede (MAIN) — patch em fetch/XHR
├── content/       Motor de DOM (ISOLATED) — ponte + varredura
├── background/    Service worker — consolidação e export v3
├── popup/         UI (abas por rede)
├── capture/       Catálogo de estratégias + registry
├── providers/     meta · contract · x/ · instagram/ · linkedin/
└── shared/        domain (modelos) · messages (protocolo)
```

Para os detalhes (mapa de arquivos, como adicionar um provider, protocolo de mensagens,
invariantes) veja **[`CLAUDE.md`](CLAUDE.md)** e o
**[ADR-0002](docs/adr/0002-providers-plugaveis-ports-and-adapters.md)**.

## Desenvolvimento

```bash
bun install            # dependências
bun run build          # compila para dist/chrome
bun test               # suíte (inclui o golden-master do export v3)
bun run typecheck      # checagem de tipos
bun run validate       # Biome + valida Manifest V3 + smoke test
bun run format         # formata o código
```

> O export v3 é um **contrato externo**: a suíte tem um *golden-master* que falha se o
> formato regredir. Não atualize os snapshots para "consertar" um teste vermelho — conserte
> o código. O pipeline completo de teste no Chrome está em
> [`docs/chrome-pipeline-teste.md`](docs/chrome-pipeline-teste.md).

## Roadmap

- [ ] **Coleta por escopo** — escolher como cada rede coleta (por perfil, por hashtag, etc.)
- [ ] **UI de Collection Target** — selecionar o alvo de coleta direto no popup
- [ ] **Estabilizar a captura do LinkedIn** no browser
- [ ] **Envio via webhook/API** — mandar os dados direto para o He4rt Hub em vez de exportar manualmente
- [ ] **Painel de métricas** — gráficos de engajamento e tendências no popup

## Licença

Ferramenta interna para gestão de comunidade da He4rt Developers.
