# Pipeline De Teste No Chrome

Esta extensão usa Bun e TypeScript. O artefato de implantação é gerado nesta pasta:

```text
/Users/prehysterik/Code/marketing-extension/instagram/dist/chrome
```

## Validação Local

Rode isto antes de carregar ou recarregar a extensão sem compactação:

```bash
bun install
bun run build
bun run validate
```

O validador verifica:

- formatação e lint com Biome;
- sintaxe JavaScript de `background.js`, `content.js`, `interceptor.js` e `popup.js`;
- configuração do Manifest V3, permissões de host, mundos dos content scripts, configuração do popup e caminhos dos ícones;
- testes com dados fixos para o protocolo de mensagens do background, comportamento do analisador, deduplicação e formato do resumo de exportação.

Para formatar o código localmente:

```bash
bun run format
```

Você também pode rodar apenas os testes:

```bash
bun test
```

## Instalar Ou Recarregar No Chrome

Use seu perfil existente do Chrome para que o X.com possa reutilizar sua sessão logada.

1. Abra `chrome://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em "Carregar sem compactação".
4. Selecione `/Users/prehysterik/Code/marketing-extension/instagram/dist/chrome`.
5. Fixe a He4rt Analytics para facilitar a abertura do popup.
6. Após alterações no código, clique em "Recarregar" no cartão da extensão He4rt Analytics.

O service worker mantém o estado de captura em memória. Recarregar o Chrome, o service worker ou a extensão pode limpar os dados capturados. O handle rastreado persiste via `chrome.storage.local`.

## Teste De Fumaca Ao Vivo No X.com

Alvo padrão: `He4rtDevs`.

1. Rode `bun run build && bun run validate`.
2. Recarregue a extensão sem compactação em `chrome://extensions`.
3. Abra `https://x.com/He4rtDevs`.
4. Abra o popup da He4rt Analytics.
5. Defina o handle rastreado como `He4rtDevs`.
6. Recarregue a aba do perfil no X.com para que os content scripts em `document_start` apliquem o patch em `fetch` e XHR cedo.
7. Role a timeline do perfil até capturar requisições `UserTweets`.
8. Abra o popup da extensão e verifique:
   - a aba Tweets mostra tweets capturados;
   - a aba Raw mostra contagens de endpoints capturados;
   - Export JSON fica habilitado quando há tweets.
9. Abra um tweet e, se o X.com expuser a lista de curtidas, abra e role o modal de curtidas para disparar `Favoriters`.
10. Exporte o JSON e inspecione o formato de topo:
    - `tracked_account`;
    - `tweets`;
    - `community_replies`;
    - `favoriters_by_tweet`;
    - `summary`.

## Expectativas De Endpoints Suportados

O teste de fumaca ao vivo deve tratar estes endpoints como suportados:

- `UserTweets`;
- `UserByScreenName`;
- `Favoriters`.

Payloads `TweetDetail` podem aparecer na aba Raw, mas ainda não devem ser marcados como aprovação do processamento de threads de respostas. A implementação atual armazena payloads brutos de `TweetDetail`, mas não processa ativamente esse endpoint para popular `community_replies`.

## Checklist De Depuração

- Verifique o console do service worker da extensão procurando mensagens como `[X Interceptor] UserTweets (...)`.
- Se a aba Raw estiver vazia, recarregue a aba do X.com depois de definir o handle rastreado.
- Se Tweets estiver vazio, mas Raw tiver `UserTweets`, confirme se o handle corresponde exatamente ao `screen_name` do autor, ignorando maiúsculas/minúsculas.
- Se Favoriters estiver vazio, confirme se a URL atual da página contém `/status/<tweet_id>` enquanto o payload de curtidas é capturado.
