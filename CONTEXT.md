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
A dimensão pela qual um Provider seleciona **quais Publications** coletar. Hoje só o modo `profile` (autor == Handle) é concreto; o conceito é extensível a `hashtag`, `campaign`, `post` sem rearquitetar.
_Avoid_: filter, target type

**Collection Target**:
O alvo ativo escolhido por humano ou automação: `{ provider, mode, value }` (ex.: `{ linkedin, profile, "He4rt Developers" }`).

**Binding**:
A ligação de um Engagement/Comment à Publication (ou Tracked Account) que ele toca — é como um engajamento entra na coleta sem o Scope precisar conhecê-lo direto.

**Provenance**:
O carimbo em cada item normalizado dizendo de qual Scope (`mode` + `value`) ele veio; consumido pelo scoring do He4rt Hub.

## Relationships

- Um **Provider** observa uma ou mais **Tracked Accounts**
- Uma **Tracked Account** tem um **Handle** (identidade) e um **Profile** (metadados)
- Uma **Tracked Account** publica zero ou mais **Publications**
- Uma **Publication** recebe zero ou mais **Comments** e zero ou mais **Engagements**
- Um **Engagement** liga exatamente um **Actor** a uma **Publication** (ou **Comment**)
- Um **Provider** suporta um ou mais **Scopes** (como ele filtra o que coleta)
- Um **Scope** seleciona **Publications**; **Comments**/**Engagements** entram por **Binding** com uma Publication selecionada ou com a **Tracked Account**
- Todo item normalizado carrega **Provenance** (qual **Collection Target** o trouxe)

## Example dialogue

> **Dev:** "Quando capturo a lista de curtidas de um post, eu guardo isso como **Publication** ou como **Engagement**?"
> **Domain expert:** "Como **Engagement** — cada curtida é um **Actor** ligado àquela **Publication**. A Publication é só o alvo; o que vale pro Hub é saber *quem* da comunidade curtiu."

> **Dev:** "No X, uma resposta da comunidade ao nosso post é **Comment** ou **Publication**?"
> **Domain expert:** "As duas coisas: é uma **Publication** do ponto de vista do autor dela, e ao mesmo tempo conta como **Engagement** do tipo comentário com a nossa **Tracked Account**."

## Flagged ambiguities

- **Publication-centric (código) vs Engagement-centric (produto)** — o código atual trata `SocialPublication` como cidadão de primeira classe e deriva engajamentos; o produto (README + ADR-0001) quer o inverso. **Resolvido (arquitetura):** _Scope seleciona Publications; Engagements seguem por Binding e são o sinal exportado pro Hub._ O store guarda os dois, mas o produto lê pelo Engagement.
- **Handle vs Profile** — o código conflata em `trackedHandle` (string) e `trackedProfiles` (metadados). Resolvido aqui: **Handle** é a identidade-string usada pra escopar; **Profile** são os metadados capturados.
- **"reply"** — usado pra dois conceitos: um subtipo de **Publication** (tweet de resposta) e um **Comment**. Manter os dois sentidos explícitos.
