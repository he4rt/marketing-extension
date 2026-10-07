# He4rt Analytics — Coleta Social

Extensão de navegador (Manifest V3) que captura passivamente o engajamento de membros da comunidade He4rt com conteúdo publicado em **redes de feed** (X/Twitter, Instagram, LinkedIn e futuras). Exporta JSON estruturado para ingestão no He4rt Hub (Laravel).

**Escopo de domínio:** redes de *feed* — onde existe publicação, comentário e curtida/reação. Plataformas de *streaming ao vivo* (chat, canais, clipes, subs) estão **fora de escopo** e exigiriam outro modelo; não projetar para elas.

## Language

**Provider**:
Uma rede de feed da qual coletamos dados (X, Instagram, LinkedIn, …); a unidade que se adiciona ao sistema.
_Avoid_: platform, network, rede, integração

**Tracked Account**:
A conta da comunidade num Provider cujo conteúdo e engajamento estamos medindo.
_Avoid_: target, conta rastreada (ok informalmente)

**Handle**:
O identificador legível de uma conta (`@He4rtDevs`, nome de organização) usado para escopar a coleta.
_Avoid_: username, screen_name

**Profile**:
Os metadados capturados de uma conta (nome, avatar, contagem de seguidores). Distinto do Handle.
_Avoid_: account info

**Publication**:
Uma peça de conteúdo num feed (post, tweet, reel, artigo). Cidadão de contexto, não necessariamente o foco do produto.
_Avoid_: post, tweet, content item

**Comment**:
Uma resposta textual a uma Publication, possivelmente aninhada.
_Avoid_: reply (reply é também um subtipo de Publication no X — não confundir)

**Engagement**:
Uma interação de um Actor com uma Publication — curtida, reação, repost/share ou comentário. **É o sinal de produto mais valioso** ("quem da comunidade interagiu com nosso conteúdo").
_Avoid_: interaction, reaction, like (são subtipos)

**Actor**:
Qualquer conta que engaja com uma Publication — tipicamente um membro da comunidade.
_Avoid_: user, engager, member

**Scope**:
A dimensão pela qual um Provider seleciona **quais Publications** coletar. Modos `profile` (autor == Handle) e `search` (Publication casa uma query/evento) são concretos; o conceito é extensível a `hashtag`, `campaign`, `post` sem rearquitetar. **Nem todo Scope tem Tracked Account**: em `search`/`campaign` a `value` é uma palavra-chave/evento, não um Handle, e os autores das Publications são justamente os **Actors** de interesse (quem da comunidade falou do tema).
_Avoid_: filter, target type

**Collection Target**:
O alvo ativo escolhido por humano ou automação: `{ provider, mode, value }` (ex.: `{ linkedin, profile, "He4rt Developers" }`).

**Binding**:
A ligação de um Engagement/Comment à Publication (ou Tracked Account) que ele toca — é como um engajamento entra na coleta sem o Scope precisar conhecê-lo direto.

**Provenance**:
O carimbo em cada item normalizado dizendo de qual Scope (`mode` + `value`) ele veio; consumido pelo scoring do He4rt Hub.

**Passive Capture**:
O mecanismo de coleta original: a extensão **só observa** o que a página já carrega (intercepta fetch/XHR, lê SSR/DOM) enquanto você navega. Nenhum request parte de nós. É o modelo de X, Instagram e LinkedIn.
_Avoid_: scraping (passivo não raspa agressivamente)

**Active Fetch**:
Mecanismo de coleta em que a extensão **origina** requests a partir do background (service worker) — usando credenciais guardadas (**api-key**) ou o cookie de sessão vivo — em vez de esperar a navegação. Dois usos: (a) **aprofundar** on-demand uma Publication já descoberta, colhendo os Engagements/contadores que a captura passiva não trouxe (ex.: a busca do LinkedIn acha o post, mas as reações vêm em streams preguiçosos); (b) ser o **mecanismo primário** de um provider sem captura passiva (ex.: dev.to). Disparado on-demand (botão "Coletar") e por AFK (`chrome.alarms`, diário, só na analytics). É **opt-in**, dosado (dry-run por padrão, volume limitado) e sujeito a ToS — distinto da captura passiva, que só observa o que a página já carrega.
_Avoid_: scraping, crawl, sync, automação de cliques

**Background-only Provider**:
Um Provider que coleta **apenas** por Active Fetch e portanto **não injeta content scripts** — declara `hostPermissions` (pro fetch credenciado) mas não `matches`. O dev.to é o primeiro.

**Publication URN / Thread**:
No LinkedIn, uma Publication tem **mais de uma identidade**: a `activity` (o *wrapper* que a busca/feed descobre) e o **thread** (`ugcPost`/`share`, a peça por baixo). Os **Engagements** são endereçados pelo **thread**, não pela activity — então descobrir a Publication (activity) **não basta** para colher engajamento; é preciso **resolver** `activity → thread`.
_Avoid_: id do post, postId (são ambíguos entre as duas identidades)

## Relationships

- Um **Provider** observa uma ou mais **Tracked Accounts**
- Uma **Tracked Account** tem um **Handle** (identidade) e um **Profile** (metadados)
- Uma **Tracked Account** publica zero ou mais **Publications**
- Uma **Publication** recebe zero ou mais **Comments** e zero ou mais **Engagements**
- Um **Engagement** liga exatamente um **Actor** a uma **Publication** (ou **Comment**)
- Um **Provider** suporta um ou mais **Scopes** (como ele filtra o que coleta)
- Um **Scope** `profile` está ancorado numa **Tracked Account** (Handle == autor); um **Scope** `search`/`campaign` **não tem Tracked Account** — é ancorado numa query/evento e o sinal vira o conjunto de **Actors** que publicaram sobre o tema
- Um **Scope** seleciona **Publications**; **Comments**/**Engagements** entram por **Binding** com uma Publication selecionada ou com a **Tracked Account**
- Todo item normalizado carrega **Provenance** (qual **Collection Target** o trouxe)
- Uma **Publication** descoberta por **Scope** `search` pode ser aprofundada por **Active Fetch** para colher seus **Engagements** — que a descoberta sozinha não traz
- No LinkedIn, o **Binding** de Engagements a uma Publication usa o **thread** (`ugcPost`), não a `activity` — resolver `activity → thread` é pré-requisito do Active Fetch; o Engagement aprofundado entra pelo **mesmo Binding** do passivo (reusa a consolidação)

## Example dialogue

> **Dev:** "Quando capturo a lista de curtidas de um post, eu guardo isso como **Publication** ou como **Engagement**?"
> **Domain expert:** "Como **Engagement** — cada curtida é um **Actor** ligado àquela **Publication**. A Publication é só o alvo; o que vale pro Hub é saber *quem* da comunidade curtiu."

> **Dev:** "No X, uma resposta da comunidade ao nosso post é **Comment** ou **Publication**?"
> **Domain expert:** "As duas coisas: é uma **Publication** do ponto de vista do autor dela, e ao mesmo tempo conta como **Engagement** do tipo comentário com a nossa **Tracked Account**."

## Flagged ambiguities

- **Publication-centric (código) vs Engagement-centric (produto)** — o código atual trata `SocialPublication` como cidadão de primeira classe e deriva engajamentos; o produto (README + ADR-0001) quer o inverso. **Resolvido (arquitetura):** _Scope seleciona Publications; Engagements seguem por Binding e são o sinal exportado pro Hub._ O store guarda os dois, mas o produto lê pelo Engagement.
- **Handle vs Profile** — o código conflata em `trackedHandle` (string) e `trackedProfiles` (metadados). Resolvido aqui: **Handle** é a identidade-string usada pra escopar; **Profile** são os metadados capturados.
- **"reply"** — usado pra dois conceitos: um subtipo de **Publication** (tweet de resposta) e um **Comment**. Manter os dois sentidos explícitos.
- **Passivo vs Ativo** — a regra de ouro do projeto (CLAUDE.md) cravava *"intercepta passivamente… não automatiza"*. O provider **dev.to** introduz **Active Fetch** (api-key na analytics oficial + cookie vivo em `/reactions`, on-demand + AFK diário só na analytics). **Resolução:** a regra passa a ser *"passivo por padrão; Active Fetch é exceção explícita, declarada por provider, GET a endpoints da própria conta logada"*. dev.to é **Background-only Provider** (sem content script). Ver ADR-0003 (a decisão e seus trade-offs de ToS/segurança).
- **activity vs thread (ugcPost) no LinkedIn** — a busca/feed entrega a `activity` URN, mas os **Engagements** são endereçados pelo **thread** (`ugcPost`/`share`). Pedir reactions/comments/reposts pela `activity` retorna **vazio** (HTTP 200, 0 itens) — não erro, o que engana. **Resolvido (entendimento):** _o **Active Fetch** precisa de um passo de **resolve** `activity→thread` antes do fan-out; a `activity` identifica a Publication, o `thread` endereça os Engagements._ Detalhes e plano em [`docs/specs/2026-06-05-l3-replay-findings.md`](docs/specs/2026-06-05-l3-replay-findings.md).
