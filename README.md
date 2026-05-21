# He4rt Analytics

Extensão de navegador que captura passivamente as respostas GraphQL do Twitter/X para rastrear engajamento da comunidade He4rt Developers.

Feita pra alimentar o **He4rt Hub** (Laravel) com dados estruturados de engajamento -- quem interage com nosso conteudo, como os posts performam, e onde o crescimento da comunidade ta acontecendo.

## O Problema

O Twitter/X nao da aos gestores de comunidade os dados que eles precisam. Voce ve curtidas e visualizacoes tweet por tweet, mas nao consegue:

- Exportar dados de engajamento em massa
- Ver quais membros da comunidade interagem consistentemente com seu conteudo
- Rastrear engajamento de replies em todos os posts
- Cruzar favoriters com o banco de dados da comunidade

Essa extensao roda em background enquanto voce navega no X, intercepta as respostas GraphQL que o app ja faz, e consolida tudo num JSON limpo pronto pra ingestao no banco.

## Como Funciona

```
  X/Twitter (navegador)        Extensao                     He4rt Hub (Laravel)
  ┌─────────────────┐     ┌──────────────────┐          ┌──────────────────────┐
  │                 │     │                  │          │                      │
  │  Voce navega    │────►│  interceptor.js  │          │   Endpoint da API    │
  │  o X normal     │     │  (MAIN world)    │          │   POST /analytics    │
  │                 │     │                  │          │                      │
  │  Requisicoes GQL│     │  Patch no fetch()│          │   Ingere JSON:       │
  │  acontecem      │     │  Clona response  │          │   - tweets           │
  │  normalmente    │     │  PostMessage     │          │   - engajamento      │
  │                 │     │                  │          │   - dados comunidade │
  └─────────────────┘     ├──────────────────┤          │                      │
                          │  content.js      │          └──────────┬───────────┘
                          │  (ISOLATED world) │                    │
                          │  Repassa pro BG  │                    │
                          ├──────────────────┤          ┌─────────▼───────────┐
                          │  background.js   │          │                     │
                          │                  │  Exporta  │   Painel            │
                          │  Filtra por      │  JSON    │   Metricas comunid. │
                          │  handle rastreado│─────────►│   Engajamento       │
                          │  Consolida       │          │   Desempenho        │
                          │  Deduplica       │          │                     │
                          └──────────────────┘          └─────────────────────┘
```

### Fluxo de Captura

```
 USUARIO                                 EXTENSAO
  │                                         │
  │  👆 Digita "He4rtDevs" + Track          │
  │ ──────────────────────────────────────► │
  │                                         │  background: trackedHandle = "He4rtDevs"
  │                                         │  chrome.storage.local.set()
  │                                         │
  │  📱 Abre x.com/He4rtDevs               │
  │     e rola os tweets                    │
  │ ──────────────────────────────────────► │
  │                                         │  interceptor.js: fetch() interceptado
  │                                         │  endpoint: UserTweets
  │                                         │  filtra: author == "He4rtDevs" ✓
  │                                         │  extrai: tweet_id, text, metrics
  │                                         │  deduplica por tweet_id
  │                                         │
  │  👆 Clica nas curtidas de um tweet      │
  │     e rola o modal                      │
  │ ──────────────────────────────────────► │
  │                                         │  endpoint: Favoriters
  │                                         │  extrai: usuarios com seguidores e badges
  │                                         │  vincula ao tweet_id via URL
  │                                         │
  │  👆 Abre popup → Export JSON            │
  │ ──────────────────────────────────────► │
  │                                         │  buildExportJSON()
  │    ┌────────────────────────────────┐   │  consolida tweets + replies +
  │    │ x-He4rtDevs-2026-05-19.json  │   │  favoriters + resumo
  │    │ (download automatico)         │   │
  │    └────────────────────────────────┘   │
```

### O que Captura

| Endpoint                | O que extraimos                                                |
| ----------------------- | -------------------------------------------------------------- |
| `UserTweets`            | Todos os tweets do handle rastreado com metricas completas     |
| `UserByScreenName`      | Dados do perfil (seguidores, bio, etc)                         |
| `Favoriters`            | Usuarios que curtiram tweets especificos                       |
| `TweetDetail`           | Threads de reply (respostas da comunidade ao handle rastreado) |
| Todos os outros GraphQL | Payloads brutos guardados pra debug/uso futuro                 |

## Instalacao

1. Clone este repo
2. Va em `chrome://extensions/`
3. Ative o **Modo desenvolvedor**
4. Clique em **Carregar sem compactacao** e selecione esta pasta

## Validacao e Teste De Fumaca

Antes de recarregar a extensao no Chrome, rode:

```bash
node scripts/validate-extension.mjs
```

Esse comando valida a estrutura do Manifest V3, faz `node --check` nos scripts principais e roda testes com dados fixos das respostas GraphQL. O fluxo completo de instalacao, recarregamento e teste de fumaca em `x.com/He4rtDevs` esta documentado em [`docs/chrome-pipeline-teste.md`](docs/chrome-pipeline-teste.md).

## Decisoes De Arquitetura

- [`ADR 0001: Coleta de dados sociais via extensao Chrome, Playwright e OpenClaw`](docs/adr/0001-coleta-social-via-extensao-openclaw.md)

## Uso

### Capturando Dados

1. Clique no icone da extensao
2. Digite o handle que quer rastrear (ex: `He4rtDevs`) e clique **Track**
3. Abra o perfil dessa conta no X
4. Role pelos tweets -- a extensao captura tudo passivamente
5. Pra capturar favoriters: clique no numero de curtidas e role pelo modal
6. Abra o popup pra ver os tweets capturados com metricas

### Exportando

Clique **Export JSON** pra baixar o arquivo estruturado:

```json
{
  "tracked_account": {
    "screen_name": "He4rtDevs",
    "name": "He4rt Developers",
    "rest_id": "1098020856431824897",
    "followers_count": 20945,
    "statuses_count": 2178
  },
  "exported_at": "2026-05-19T00:15:00.000Z",
  "tweets": [
    {
      "tweet_id": "2056491987205865474",
      "text": "Reuniao semanal da @He4rtDevs...",
      "type": "original",
      "metrics": {
        "favorite_count": 8,
        "retweet_count": 4,
        "reply_count": 2,
        "quote_count": 1,
        "bookmark_count": 0,
        "view_count": 354
      },
      "hashtags": ["He4rtDevelopers"],
      "user_mentions": [{ "screen_name": "He4rtDevs" }],
      "media_count": 2,
      "source": "Twitter for iPhone"
    }
  ],
  "community_replies": [
    {
      "tweet_id": "...",
      "author": {
        "screen_name": "membro_da_comunidade",
        "rest_id": "...",
        "followers_count": 150
      },
      "in_reply_to_tweet_id": "2056491987205865474"
    }
  ],
  "favoriters_by_tweet": {
    "2056491987205865474": [
      {
        "rest_id": "...",
        "screen_name": "...",
        "following": true,
        "followed_by": true
      }
    ]
  },
  "summary": {
    "total_tweets": 20,
    "total_original": 15,
    "total_retweets": 3,
    "total_community_replies": 45,
    "total_likes": 500,
    "total_views": 15000,
    "avg_likes_per_original": 33,
    "avg_views_per_original": 1000,
    "unique_engagers": 87,
    "top_tweet_by_likes": "2052386746126553531",
    "top_tweet_by_views": "2051468028299153703"
  }
}
```

## Arquitetura

```
he4rt-analytics/
├── manifest.json        # Config da extensao (Manifest V3)
├── interceptor.js       # Roda em MAIN world — patch no fetch/XHR em x.com
├── content.js           # Roda em ISOLATED world — ponte pagina <-> background
├── background.js        # Service worker — filtragem, consolidacao, export
├── popup.html           # UI do popup da extensao
├── popup.css            # Tema dark (estilo X)
├── popup.js             # Logica do popup — tabs, render, export
└── icons/               # Icones da extensao
```

**Por que dois content scripts?**

O X.com tem CSP restrito que bloqueia scripts inline. `interceptor.js` roda em `"world": "MAIN"` (contexto da pagina) pra acessar `window.fetch`. `content.js` roda em `"world": "ISOLATED"` (contexto da extensao) pra usar `chrome.runtime`. Comunicam via `window.postMessage`.

## Integracao com He4rt Hub

O JSON exportado foi desenhado pra ingestao direta no He4rt Hub (Laravel):

```php
// Exemplo: artisan command pra ingerir JSON exportado
$data = json_decode(file_get_contents($path), true);

// Upsert da conta
$account = TwitterAccount::updateOrCreate(
    ['rest_id' => $data['tracked_account']['rest_id']],
    $data['tracked_account']
);

// Upsert dos tweets
foreach ($data['tweets'] as $tweet) {
    Tweet::updateOrCreate(
        ['tweet_id' => $tweet['tweet_id']],
        [...$tweet, 'twitter_account_id' => $account->id]
    );
}

// Rastrear engajamento da comunidade
foreach ($data['community_replies'] as $reply) {
    CommunityEngagement::updateOrCreate(
        ['tweet_id' => $reply['tweet_id']],
        [
            'author_rest_id' => $reply['author']['rest_id'],
            'author_screen_name' => $reply['author']['screen_name'],
            'type' => 'reply',
        ]
    );
}

// Rastrear favoriters
foreach ($data['favoriters_by_tweet'] as $tweetId => $users) {
    foreach ($users as $user) {
        CommunityEngagement::updateOrCreate(
            ['tweet_id' => $tweetId, 'author_rest_id' => $user['rest_id']],
            [
                'author_screen_name' => $user['screen_name'],
                'type' => 'like',
                'is_mutual' => $user['following'] && $user['followed_by'],
            ]
        );
    }
}
```

## Roadmap

- [ ] **Captura com rolagem automatica** -- scroll automatico pra capturar historico completo de tweets sem interacao manual
- [ ] **Painel de metricas** -- graficos de engajamento e tendencias direto no popup da extensao
- [ ] **Envio via webhook/API** -- enviar dados capturados direto pra API do He4rt Hub ao inves de exportar JSON manualmente
- [ ] **Processamento de TweetDetail** -- extrair threads de replies completas ao abrir tweets individuais
- [ ] **Pontuacao de engajamento** -- rankear membros da comunidade por frequencia e qualidade de interacao

## Licenca

Ferramenta interna pra gestao de comunidade da He4rt Developers.
