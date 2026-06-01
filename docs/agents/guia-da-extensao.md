# Guia Da Extensão Para Agentes

Este arquivo centraliza as instruções para agentes de código que trabalham neste repositório. Arquivos específicos de agentes, como `AGENTS.md` e `CLAUDE.md`, devem apontar para este guia em vez de duplicar conteúdo.

## O Que É Isto

He4rt Analytics — uma extensão Chrome (Manifest V3) que intercepta passivamente respostas da API GraphQL do Twitter/X para rastrear engajamento da comunidade. Foi desenhada para exportar JSON estruturado para ingestão no app Laravel do He4rt Hub.

A extensão usa Bun e TypeScript. Rode `bun run build` e carregue a pasta `dist/chrome` em `chrome://extensions/` com o modo de desenvolvedor ativado.

## Arquitetura

A extensão tem um pipeline de três camadas, dividido entre contextos de execução por causa da CSP restrita do X.com:

```text
interceptor.js (mundo MAIN)  →  content.js (mundo ISOLATED)  →  background.js (service worker)
aplica patch em fetch/XHR        faz ponte via postMessage         filtra, consolida e exporta
roda no contexto da página       roda no contexto da extensão      mantém todo o estado em memória
```

**Por que dois content scripts:** a CSP do X.com bloqueia scripts inline. `interceptor.js` precisa acessar `window.fetch` no mundo `MAIN`. `content.js` precisa acessar `chrome.runtime` no mundo `ISOLATED`. Eles se comunicam via `window.postMessage`.

**Fluxo de dados de uma requisição capturada:**

1. `interceptor.js` — o monkey patch de fetch/XHR detecta URLs compatíveis com `/i/api/graphql/*/ENDPOINT`.
2. Clona a resposta, extrai o nome do endpoint e envia o payload via `postMessage`.
3. `content.js` — recebe a mensagem e encaminha para o background via `chrome.runtime.sendMessage`.
4. `background.js` — armazena o payload bruto e processa de acordo com o tipo de endpoint:
   - `UserTweets` → extrai tweets filtrados por `store.trackedHandle` e deduplica por `tweet_id`;
   - `Favoriters` → extrai a lista de usuários e vincula ao ID do tweet parseado da URL da página;
   - `UserByScreenName` → captura metadados do perfil da conta;
   - replies da comunidade (tweets respondendo ao handle rastreado por outros usuários) são armazenados separadamente.

**Estado:** todos os dados vivem no objeto `store` do service worker (volátil). Apenas `trackedHandle` persiste via `chrome.storage.local`. Quando o handle muda, todos os payloads `UserTweets` em cache são reprocessados usando o novo filtro.

## Formatos Importantes Das Respostas GraphQL Do X/Twitter

Os dados do autor do tweet ficam divididos em dois objetos — errar isso gera campos vazios silenciosamente:

- **Nome/screen_name** → `result.core.name`, `result.core.screen_name`;
- **Seguidores/estatísticas** → `result.legacy.followers_count`, etc.;
- **Avatar** → `result.avatar.image_url`;
- **Protegido** → `result.privacy.protected`;
- **Relacionamentos** → `result.relationship_perspectives.following`, `.followed_by`.

Os dados de tweet em `UserTweets` ficam profundamente aninhados com vários tipos de instrução:

- `TimelinePinEntry` → tweet fixado único em `instruction.entry.content.itemContent.tweet_results.result`;
- `TimelineAddEntries` → array de entries, cada uma podendo ser `TimelineTimelineItem` (tweet único) ou `TimelineTimelineModule` (thread/conversa com `.items[]`);
- cursores e módulos de "quem seguir" (`who to follow`) devem ser ignorados.

Detecção de tipo de tweet: verificar `legacy.retweeted_status_result` (retweet), `legacy.in_reply_to_status_id_str` (reply), `legacy.is_quote_status + quoted_status_id_str` (quote); caso contrário, tratar como original.

## Protocolo De Mensagens

A comunicação Popup ↔ Background usa `chrome.runtime.sendMessage` com uma string `action`:

| Ação | Direção | Finalidade |
|---|---|---|
| `GRAPHQL_CAPTURED` | content → bg | Nova resposta interceptada |
| `SET_HANDLE` / `GET_HANDLE` | popup → bg | Rastrear um handle (limpa + reprocessa) |
| `GET_TWEETS` | popup → bg | Tweets consolidados para exibição |
| `GET_EXPORT` | popup → bg | JSON estruturado completo para download |
| `GET_ENDPOINTS` | popup → bg | Resumo de todos os endpoints capturados |
| `GET_ENDPOINT_PAYLOADS` | popup → bg | Payloads brutos de um endpoint específico |
| `CLEAR_ALL` | popup → bg | Limpar tudo exceto o handle |

Todos os handlers retornam `true` para manter o canal de mensagens aberto para respostas assíncronas.

## Estrutura Do JSON De Exportação

A ação `GET_EXPORT` retorna um objeto JSON desenhado para ingestão direta no Laravel:

- `tracked_account` — metadados do perfil;
- `tweets[]` — todos os tweets do handle rastreado, com métricas e tipo `original`/`retweet`/`reply`/`quote`;
- `community_replies[]` — replies ao handle rastreado feitas por outros usuários;
- `favoriters_by_tweet` — mapa `tweet_id` → arrays de usuários;
- `summary` — estatísticas agregadas (totais, médias, principais tweets, engajadores únicos).
