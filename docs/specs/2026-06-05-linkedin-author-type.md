# LinkedIn member/org/reshare-aware collection + activity→ugcPost resolve

> Spec de implementação decision-ready. Idioma do repo: português; termos de domínio LinkedIn (member/org/reshare,
> activity/ugcPost) mantidos em inglês por serem identidade de URN.
>
> Status: DRAFT — fase de síntese (READ-ONLY do source). Nenhum arquivo de source foi editado para produzir esta spec.
> **Revisado contra verdicts adversariais** — ver **§12 (Verification & open blockers)**. Claims refutadas marcadas ⚠️
> no corpo. Resumo: golden-master strategy ✅; member resolve direto ⚠️ contestado; `feedDashUpdates` sem decoder ⚠️
> refutado; org/reshare SDUI **não validável** sem recaptura (blocker); `process.ts` line-budget **estourado**.
>
> ⚠️ **ATUALIZAÇÃO 2026-06-05 — ver §13 (autoritativa).** A captura ao vivo (#laraveldaysp, bytes reais) **desbloqueou
> B1 e refutou B2/B3**: o classificador SDUI tem sinal real (NAV `/company|/school|/in`) e o mapeamento
> activity→ugcPost vem **INLINE** no stream (`postThreadUrn`), eliminando o `voyagerFeedDashUpdates` **e** o decoder
> microSchema. §13 é o design simplificado vigente; as seções abaixo ficam como histórico — claims supersedidas estão
> anotadas e remetem à §13.

---

## 1. Motivação (o "porquê")

Hoje o caminho **SDUI da busca** (`src/providers/linkedin/search/sdui/*` + `process.ts`) **achata todo post em "um
post original de um membro"**. Sintomas reais no export de um perfil:

- Autores de **org** recebem **urn/vanity FALSOS** (slug `heart_developers`, produzido por
  `name.toLowerCase().replace(/\s+/g,"_")` em `post-extractor.ts:47`).
- `type` é sempre `"original"` (`post-extractor.ts:67` e `process.ts:41`); `reposted_by` nunca é setado → **reshares
  perdem a estrutura de dois atores**.
- `reaction_type` por engajador sempre `""`; **16/19 posts com `metrics:0`** e engajadores vazios — porque o
  `activity_urn` de org não resolve reações (200-empty: a thread vive no **ugcPost interno**, não na activity).

O caminho **passivo do feed** (`linkedinFeedToPosts`, `parser.ts:774-893`) **JÁ faz** member/org/reshare corretamente.
Esta spec **porta esse conhecimento** para o SDUI e **conserta o resolve do Active Fetch** (activity→ugcPost) para
org/reshare ganharem métricas + engajadores reais.

### Limitação de evidência (BLOQUEANTE para org/reshare no SDUI)

O `.har` real (`~/Downloads/www.linkedin.com.har`) **tem os corpos SDUI removidos** (octet-stream 2.6 MB, `text=""`).
As URNs de org `7458263820537556992` e `7457908766680977408` **não aparecem em lugar nenhum** do har. As fixtures atuais
têm **3 posts member e 0 org/reshare**. Logo: **nenhuma extração de org/reshare pode ser validada antes de uma nova
captura** (Chrome DevTools → "Save all as HAR with content", rolando uma SRP que inclua um post de empresa e um repost).
O único sinal member-vs-org disponível no stream SDIU é a **Navigate URL do próprio bloco do autor** (`/in/` vs
`/company/` vs `/school/`) — nunca um `urn:` decorado inline.

---

## 2. Modelo mental member / org / reshare (a verdade settled)

```
                         ┌──────────────── CONTENT URN (o post em si) ────────────────┐
                         │  urn:li:share:{id}     (legado / Posts API)                 │
                         │  urn:li:ugcPost:{id}   (UGC; org resolve POR AQUI)          │
                         └─────────────────────────────┬──────────────────────────────┘
                                                       │  é envolvido por
                                                       ▼
                         ┌──────────────── ACTIVITY URN (wrapper de feed) ─────────────┐
                         │  urn:li:activity:{id}   (id público /feed/update/...)       │
                         │  chave de socialActions p/ reactions/comments               │
                         └─────────────────────────────┬──────────────────────────────┘
                                                       │  decorado como
                                                       ▼
                         ┌──────────────── fsd_update (card Voyager-DASH) ─────────────┐
                         │  actor · header · commentary · metadata.shareUrn · social   │
                         └──────────────────────────────────────────────────────────┘

AUTHOR KIND  ── decidido pelo NAMESPACE da urn do autor, nunca pelo texto do slug:
   MEMBER  →  urn:li:fsd_profile / urn:li:person      →  link /in/<vanity>
   ORG     →  urn:li:fsd_company / urn:li:organization →  link /company/<vanity> (school = /school/)

   SDUI (busca): a urn NÃO vem inline → KIND vem da Navigate URL do bloco feed-actor DAQUELE post.
   Voyager-DASH (feed/resolve): KIND vem de actor.image…detailData → nonEntityCompanyLogo (ORG) vs
                                nonEntityProfilePicture (MEMBER); vanity real via *company → byEntityUrn[*company].url.

           ┌── MEMBER POST ──┐     ┌── ORG POST ──┐     ┌──────── RESHARE (2 atores) ────────┐
  actor →  │ pessoa          │     │ empresa      │     │ actor = AUTOR ORIGINAL              │
  header→  │ —               │     │ —            │     │ header = "<resharer> reposted this" │
  type  →  │ "original"      │     │ "original"   │     │ "repost" + reposted_by{name,        │
           │                 │     │              │     │            original_author}          │
           └─────────────────┘     └──────────────┘     └─────────────────────────────────────┘

RESOLVE (Active Fetch L3) — qual threadUrn aprofundar:
   MEMBER:  threadUrn = urn:li:activity:{id}   ⚠️ CONTESTADO — ver §12 (B2)
   ORG:     activity → 200-EMPTY ❌  → precisa resolver o ugcPost/share interno e usar ESSE threadUrn
   RESHARE: aprofundar o POST ORIGINAL (reshareContext.parent), não o wrapper do resharer

   ⚠️ SUPERSEDIDO por §13: NÃO há estágio de resolve via rede. O ugcPost de CADA post (member E org) já vem
      INLINE no nó do stream SDUI (postThreadUrn → userGeneratedContentId). threadUrn = ugcPost lido inline.
```

**Assimetria-chave de design:** detectar KIND **não é cosmético** — ele **decide se o Active Fetch precisa resolver o
ugcPost antes** de replicar reactions/comments. **A premissa "member não precisa" está CONTESTADA** (verdict
adversarial + memória `l3-replay-precisa-ugcpost`): a memória afirma que `threadUrn:<activity>` → **200 mas 0
elementos** de forma geral, e que os **três** endpoints sociais usam `ugcPost`. O har valida que o member
`7457919329506955265` retorna `total:15` quando o threadUrn é o activity — mas pode ser um caso onde activity≡ugcPost
ou onde a thread já fora resolvida. **Tratar como hipótese até a recaptura confirmar** (§12 B2). Pior caso: TODOS os
kinds precisam de um resolve → ~2 GETs autenticados por post → custo ToS ~dobra (§12 B5).

---

## 3. Contrato do classificador compartilhado (member/org/reshare)

Ponto de unificação entre os dois caminhos. Hoje só o passivo (`parser.ts:826-887`) classifica; o SDUI não.

```ts
// PROPOSTA — src/providers/linkedin/shared/author-kind.ts  (PURO, sem chrome.*, < 60 linhas)
export type AuthorKind = "member" | "organization";

export type ClassifiedAuthor = {
  kind: AuthorKind;
  urn: string;          // member: fsd_profile/person ; org: fsd_company/organization ; "" se desconhecido
  vanity_name: string;  // último segmento de /in|company|school/<vanity> — NUNCA slug do display name
};

export type ReshareInfo = { name: string; original_author: string } | null;

// SDUI: a partir da Navigate URL do bloco feed-actor DESTE post.
export function classifyFromNavigateUrl(navUrl: string, displayName: string): ClassifiedAuthor;
// Voyager-DASH: a partir de actor.image…detailData + byEntityUrn (porta de parser.ts:826-850).
export function classifyFromActor(actor: AnyRecord, byEntityUrn: Record<string, AnyRecord>): ClassifiedAuthor;
// Reshare: header text → "reposted"/"compartilhou" (locale) OU 2º feed-actor estrutural no SDUI.
export function detectReshare(headerText: string, originalAuthor: string): ReshareInfo;
```

Regra de confiabilidade dos sinais (do mais forte ao mais fraco): **namespace da urn do autor** (só decorado no
Voyager-DASH) > **path da Navigate URL `/company|/school|/in`** (o sinal disponível no SDUI) > **header
"reposted/reshared/compartilhou"** (marcador de reshare, sensível a locale). **Nunca** classificar por contagem
global de `/company/` no stream — escopar ao bloco feed-actor do post (senão o `/company/space-o-technologies`
embutido no corpo de um post member sequestra o vanity — bug provado).

---

## 4. Raio de explosão do golden-master

`buildPlatformDataLinkedin` (`index.ts:303-389`) faz `...post` (spread de `LinkedInPostData`) verbatim em cada
`content[]`. Logo **qualquer campo novo em `LinkedInPostData` aparece no snapshot**. Os 4 snapshots existentes:

| Snapshot | Path de código | Conteúdo | Risco |
|---|---|---|---|
| `...X 1`, `...Instagram 1` | — | — | nunca afetado por mudança só-LinkedIn |
| `...LinkedIn 1` (snap:592-771) | `linkedinFeedToPosts` (feed) | 1 ORG (`urn:li:company:123`), `type:"original"` | afetado só se mexer no FEED path ou tornar campo novo obrigatório |
| `...LinkedIn (search) 1` (snap:773-894) | `publicationToPostData` (SDUI) | 1 MEMBER (umar-waqas), `type:"original"`, sem `reposted_by` | afetado se o post member mudar valor emitido |

**Regra de ouro (provada):** `JSON.stringify` **omite `undefined`**. Campos **opcionais setados SÓ em org/reshare**
ficam `undefined` no post member umar-waqas e no feed → **os 4 snapshots permanecem byte-idênticos**. Precedente vivo:
`provenance?` (emitido só quando `mode==="search"`, `index.ts:370-381`) e `reposted_by?` (`domain.ts:188`).

---

## 5. Golden-master strategy (como aterrissar mudança de export SEM editar snapshot)

**Proibido:** `bun test -u` / `--update-snapshots`; editar `test/__snapshots__/`.

Três vias legítimas, em ordem de preferência:

1. **Aditivo + opcional, gated por kind.** Adicionar `author.author_type?`, `author.company_urn?` e popular
   `reposted_by?` **apenas** em posts org/reshare. Em member ficam `undefined` → omitidos → os 4 snapshots intactos.
   Espelha exatamente o padrão `provenance?`.
2. **Nova fixture + nova chave de snapshot.** Criar `linkedin-search-sdui-org.min.txt` e
   `linkedin-search-sdui-reshare.min.txt` (de uma captura COM corpos) e novos `test("LinkedIn (search org)")` /
   `test("LinkedIn (search reshare)")`. A 1ª execução de `toMatchSnapshot` **escreve a chave nova** (sem `-u`, porque
   a chave ainda não existe). Foi assim que `LinkedIn (search)` nasceu (`test/golden-master.test.ts:177-181`).
3. **Regen explícito aprovado pelo dono.** Se a melhoria MUDAR um valor emitido de um post-kind já coberto por fixture
   (ex.: flipar o `type` do umar-waqas, ou tornar `author_type` obrigatório/sempre-emitido) → é **mudança intencional
   de contrato de export** → exige **decisão explícita do dono** para regenerar aquele snapshot específico. O agente
   **não** auto-aprova. (Ver `decisions_for_user`.)

**Invariante #3 (richness):** qualquer refactor de `publicationToPostData`/`metrics-reader.ts` deve manter o merge de
`reaction_breakdown`/`total_reactions` (`process.ts:105-112`, `metrics-reader.ts:53-68`) intacto.

---

## 6. Fluxo USER / SYSTEM

```
 USER                                   SYSTEM
  │                                        │
  │  📱 rola SRP da busca LinkedIn          │
  │ ─────────────────────────────────────► │  interceptor (MAIN): networkIntercept casa search/results/content
  │                                        │  → SOCIAL_CAPTURED (responseFormat:"text")
  │                                        │
  │                                        │  process.ts: parseLinkedInSearchSdui(stream)
  │                                        │  ┌ post-extractor: por feed-actor node →
  │                                        │  │   classifyFromNavigateUrl(/in|/company|/school)
  │                                        │  │   → kind=member|organization, vanity REAL
  │                                        │  │   detectReshare(header) → type, reposted_by?
  │                                        │  └ metrics-reader: reaction_breakdown (richness)
  │                                        │  storePublication + lstore.posts/feedOrder
  │                                        │  provenance {mode:"search", value:<keywords>}
  │                                        │
  │    "19 descobertos · 0 ilegíveis ·     │
  │     12/19 com métricas"  (console SW)  │
  │ ◄──────────────────────────────────────│
  │                                        │
  │    ┌────────────────────────────────┐  │
  │    │ [Active Fetch (dry-run)]       │  │
  │    │ [Exportar JSON v3]             │  │
  │    └────────────────────────────────┘  │
  │                                        │
  │  👆 "Active Fetch (dry-run)"           │
  │ ─────────────────────────────────────► │  enumerateTargets(store) → [{id, activityUrn, kind}]
  │                                        │  resolveTarget(target):
  │                                        │   ├ member → threadUrn = activity ✅
  │                                        │   └ org    → feedDashUpdates(activity) → ugcPost/share
  │                                        │             → threadUrn = ugcPost ✅ (evita 200-empty)
  │                                        │  fan-out: reactions → comments → reposts (csrf via cookie)
  │                                        │
  │    "dry-run: 7 alvos org resolveriam   │
  │     ugcPost; 12 member direto"         │
  │ ◄──────────────────────────────────────│
  │                                        │
  │  👆 "Exportar JSON v3"                 │
  │ ─────────────────────────────────────► │  buildExportJSON → per_platform.linkedin.content[]
  │                                        │  member/org/reshare corretos; engagers ligados via
  │                                        │  activity_urn fallback (index.ts:313-320)
  │    ┌────────────────────────────────┐  │
  │    │ he4rt-analytics-<data>.json    │  │
  │    └────────────────────────────────┘  │
  │ ◄──────────────────────────────────────│
```

---

## 7. Mudanças propostas (com before/after)

### 7.1 — Classificador compartilhado (NOVO arquivo)
`src/providers/linkedin/shared/author-kind.ts` — contrato da §3. PURO, testável isolado. `snapshot_impact: safe`
(nada chama ainda). Decompõe member/org/reshare para os dois caminhos reusarem. **< 60 linhas.**

### 7.2 — SDUI: classificar por bloco feed-actor (não global)

**Before** (`post-extractor.ts:28,45-55`):
```ts
const VANITY = /\/in\/([A-Za-z0-9\-%]+)/;          // só member; pega 1º /in/ do node
function buildAuthor(rawObject, activityUrn, name): SocialActor {
  const vanity = VANITY.exec(rawObject)?.[1] ?? "";
  const username = vanity || name.toLowerCase().replace(/\s+/g, "_"); // ← slug FALSO p/ org
  return { provider:"linkedin", provider_user_id: username || activityUrn, username, name, avatar_url:"" };
}
```

**After** (sketch):
```ts
// Navigate URL DESTE node (member /in/, org /company/, school /school/). Escopo = rawObject do node.
const NAV = /linkedin\.com\/(in|company|school)\/([A-Za-z0-9\-%]+)/;
function buildAuthor(rawObject, activityUrn, name): SocialActor {
  const m = NAV.exec(rawObject);
  const kind = m && m[1] !== "in" ? "organization" : "member";
  const vanity = m?.[2] ?? "";            // NUNCA slugificar o display name
  return { provider:"linkedin", provider_user_id: vanity || activityUrn, username: vanity, name,
           avatar_url:"", author_kind: kind };  // author_kind aditivo no SocialActor (opcional)
}
```
`snapshot_impact: affects-snapshot` — ⚠️ o post member umar-waqas hoje deriva vanity de `/in/umar-waqas` → `NAV`
continua casando `in` → `vanity="umar-waqas"`, **valor idêntico** → na prática **safe para o snapshot atual** SE o
regex novo produzir exatamente `umar-waqas`. Marcado `affects-snapshot` por precaução: validar que a 1ª match `NAV`
no node member é o `/in/umar-waqas` e não um `/company/` embutido no corpo. **< 150 linhas** (arquivo cresce ~10
linhas; ok). Detecção de reshare (`detectReshare`) entra aqui setando `type`/`reposted_by`, gated.

### 7.3 — `process.ts`: parar de hardcodar, propagar kind/reshare

**Before** (`process.ts:41-48`):
```ts
type: "original",
author: { urn: pub.author.provider_user_id, name: pub.author.name,
          headline: pub.author.full_name ?? "", avatar_url: pub.author.avatar_url ?? "",
          vanity_name: pub.author.username },
```
**After** (sketch):
```ts
type: pub.type ?? "original",   // derivado na extração; member/org → "original", reshare → "repost"
author: { urn: pub.author.provider_user_id, name: pub.author.name,
          headline: pub.author.full_name ?? "", avatar_url: pub.author.avatar_url ?? "",
          vanity_name: pub.author.username,
          ...(pub.author.author_kind === "organization"
              ? { author_type: "organization", company_urn: pub.author.provider_user_id } : {}) },
...(pub.reposted_by ? { reposted_by: pub.reposted_by } : {}),
```
`snapshot_impact: safe` — campos `author_type`/`company_urn`/`reposted_by` só aparecem em org/reshare (ausentes nas
fixtures atuais → omitidos por `JSON.stringify`). Member umar-waqas continua sem eles.

⚠️ **LINE-BUDGET REFUTADO (`line_budget_ok` era `true`, é `false`):** `process.ts` **já tem 146 linhas** (verificado
`wc -l`), 4 abaixo do cap de 150. As 3 condicionais gated + o plumbing de kind cruzam o limite. Por isso, **antes**
de editar, **decompor**: extrair `publicationToPostData` + o builder de author/gating para um arquivo NOVO
`src/providers/linkedin/search/sdui/post-data.ts` (~40 linhas), conforme a regra `source-file-150-line-limit`
("não refatore arquivos legados in-place; ponha a lógica nova em arquivos novos"). A lógica gated nasce no arquivo
novo; `process.ts` apenas importa e fica `<150`. **`line_budget_ok: false` até a decomposição estar planejada.**

### 7.4 — Domain: campos aditivos opcionais
`src/shared/domain.ts:169-175` — adicionar em `LinkedInPostData.author`: `author_type?: "member" | "organization"`,
`company_urn?: string`. `SocialActor` ganha `author_kind?: AuthorKind` (interno, não exportado). `type` já aceita
`"repost"` (`domain.ts:168`) — sem widening. `snapshot_impact: safe` (opcionais). **< 150 linhas.**

### 7.5 — Active Fetch resolve seam (activity→ugcPost)

> ⚠️ **SEÇÃO SUPERSEDIDA por §13.** O seam `resolveTarget`, o endpoint `feedDashUpdates` e o decoder microSchema
> foram **ELIMINADOS**: o ugcPost vem inline no stream (`postThreadUrn`). O `targets.ts` lê `ugcPostUrn` direto do
> post; `endpoints.ts` recebe `threadUrn = ugcPost`. Mantido aqui só como histórico do caminho descartado.

**Before** — `targets.ts:12-15` enumera só `{id, activityUrn}`; `endpoints.ts` sempre usa `threadUrn:<activityUrn>`.

**After** — introduzir o seam `resolveTarget`:
```ts
// src/providers/linkedin/active-fetch/resolve.ts  (NOVO, < 80 linhas)
export type ResolvedTarget = { activityUrn: string; threadUrn: string; kind: AuthorKind };

// member → threadUrn = activity (provado). org → resolve ugcPost via feedDashUpdates e usa ESSE.
export async function resolveTarget(t: ActiveFetchTarget, deps): Promise<ResolvedTarget> {
  if (t.kind === "member") return { activityUrn: t.activityUrn, threadUrn: t.activityUrn, kind: "member" };
  const update = await deps.fetchFeedDashUpdates(t.activityUrn);     // accept normalized json 2.1
  const inner = readInnerThreadUrn(update);                          // metadata.shareUrn | *socialDetail threadUrn
  return { activityUrn: t.activityUrn, threadUrn: inner || t.activityUrn, kind: "organization" };
}
```
`endpoints.ts` muda para receber o **threadUrn resolvido** (não a activity crua):
```ts
// buildVariables(threadUrn) — o caller passa ResolvedTarget.threadUrn; member==activity, org==ugcPost.
socialDashReactions: { buildVariables: (threadUrn) => `(${PAGINACAO},threadUrn:${encodeURIComponent(threadUrn)})` }
```
`targets.ts` passa a carregar `kind` (lido de `post.author.author_type ?? "member"`). `snapshot_impact: safe` — o
Active Fetch consolida sob `activity_urn` e o export liga via fallback `index.ts:313-320`; nenhum campo de shape novo
no export **DESDE QUE o re-keying de §12 B4 seja implementado** (sem ele, os engajadores org ficam keyados sob o
ugcPost e o lookup `index.ts:313` por activity_urn falha → richness recuperada mas DESCARTADA no bind).

**NOVO endpoint `feedDashUpdates`** (4º descritor). ⚠️ **CLAIM REFUTADA:** a versão anterior desta spec dizia que a
resposta podia ser roteada por `linkedinFeedToPosts` **sem** decoder microSchema. A memória `l3-replay-precisa-ugcpost`
afirma o oposto: a resposta de `voyagerFeedDashUpdates` é **microSchema-comprimida** (chaves hasheadas; nomes só em
`meta.microSchema`), **diferente** dos endpoints sociais que vêm legíveis em `included[]`. `linkedinFeedToPosts`
(`parser.ts:774`) lê o shape legível `included[]/byEntityUrn`, **não** o microSchema hasheado. Logo: ou (a) a resposta
exige um **estágio de decode microSchema** antes do parser, ou (b) o `accept: normalized json 2.1` força a resposta
legível — **não validado**. **BLOQUEANTE** até a recaptura confirmar a shape real (§12 B3). Não shippar `resolve.ts`
assumindo "no decoder". **< 150 linhas** cada.

### 7.6 — Novas fixtures + novos testes (golden-master via via-2)
`test/fixtures/linkedin-search-sdui-org.min.txt`, `...-reshare.min.txt` (de captura COM corpos) + `test/providers/...`
asserts de kind/reshare + `test("LinkedIn (search org)")`/`(search reshare)` no golden-master. `snapshot_impact: safe`
(chaves novas, escritas na 1ª run). Testes isentos do limite de 150 linhas.

---

## 8. BDD — given / then

**Member (backward-compat — o oráculo atual):**
- Given um node feed-actor com Navigate `/in/umar-waqas` e sem header "reposted"
- Then `author.vanity_name="umar-waqas"`, `author.urn="umar-waqas"`, `type="original"`, **sem** `author_type`,
  `company_urn`, `reposted_by` → snapshot `LinkedIn (search) 1` **byte-idêntico**.

**Org:**
- Given um node com Navigate `/company/he4rt` (escopado ao bloco do autor)
- Then `author.author_type="organization"`, `vanity_name="he4rt"` (real, **não** `heart_developers`),
  `company_urn` preenchido, `type="original"`; member-post no mesmo stream **não** ganha esses campos.

**Org + corpo com /company/ embutido (anti-hijack):**
- Given um post member cujo corpo embute `/company/space-o-technologies`
- Then o vanity vem do bloco feed-actor (`/in/...`), **não** do `/company/` do corpo → classificado member.

**Reshare (2 atores):**
- Given header "<Resharer> reposted this" sobre conteúdo de `<Autor Original>`
- Then `type="repost"`, `reposted_by={name:"<Resharer>", original_author:"<Autor Original>"}`, `author`= autor
  original. Member sem header → `reposted_by` **ausente** (omitido).

**Active Fetch resolve — member:**
- Given target kind=member, activity `7457919329506955265`
- Then `threadUrn=activity`; reactions retornam `paging.total=15`; engajadores ligam via fallback activity_urn.

**Active Fetch resolve — org:**
- Given target kind=organization, activity `7458263820537556992` (200-empty direto)
- Then `feedDashUpdates(activity)` resolve o ugcPost interno; `threadUrn=ugcPost`; reactions/comments retornam não-vazio.

**Richness preservada:**
- Given qualquer refactor de `publicationToPostData`/`metrics-reader`
- Then `reaction_breakdown`/`total_reactions` continuam presentes; nenhum post regride para `metrics:0` por downgrade
  (`preserveMetrics` mantém).

---

## 9. Sequência safe-first (workflow 2)

> **Reordenado pós-verdict:** o **passo 0 é a recaptura** — sem ela os passos 3-5 (extração org/reshare) e o branch org
> do passo 4 **não são testáveis**. Construir só o que é provável-safe agora; gatear o resto na recaptura (§12).

0. **(BLOQUEANTE — pré-requisito)** Recapturar HAR COM corpos (DevTools "Save all as HAR with content") numa SRP com
   ≥1 post `/company/`, ≥1 repost, ≥1 post member com `/company/` embutido no corpo (anti-hijack), **disparando** um
   `SocialDashReactions` org (observar o 200-empty) e um `voyagerFeedDashUpdates` org (confirmar a shape e o campo do
   inner urn). Ver §12 — nada de org/reshare/resolve antes disto.
1. **(safe)** `shared/author-kind.ts` (classificador puro) + unit tests. Nada chama → 0 impacto snapshot.
2. **(safe)** Domain: campos opcionais `author_type?`/`company_urn?`/`author_kind?`. Opcionais → snapshots intactos.
3. **(safe, mas requer decomposição primeiro)** Extrair `publicationToPostData` → `search/sdui/post-data.ts` (line-budget,
   §7.3); então emitir `author_type`/`company_urn`/`reposted_by` gated por kind/reshare (org/reshare only).
4. **(seam safe · branch org BLOQUEADO)** Active Fetch: o **scaffold** `resolveTarget` + `targets.ts` carrega kind é safe;
   shippar com **org como no-op** (`threadUrn=activityUrn`) até a recaptura provar a leitura do inner urn. O **branch org**
   (`feedDashUpdates`→ugcPost) + o `feedDashUpdates` (4º endpoint, possível decoder microSchema) ficam **BLOQUEADOS** na
   recaptura (§12 B2/B3). Implementar o **re-keying** ugcPost→activity_urn (§12 B4) **junto** com o branch org.
5. **(via-2)** Novas fixtures org/reshare (de captura COM corpos) + novos testes golden-master (chaves novas).
6. **(affects-snapshot — gated por decisão + CI)** `post-extractor.ts` trocar `VANITY` por `NAV`. **Diff do snapshot
   `LinkedIn (search)` ANTES do merge como gate de CI** (não só nota): validar que o node member ainda produz
   `umar-waqas` E `type:"original"` — `detectReshare` (locale-dependent) poderia em tese flipar o `type` e quebrar a
   chave existente em silêncio. Se mudar valor → escalar para o dono (§Decisões).
7. **(browser)** Carregar `dist/chrome`, capturar HAR com corpos, validar org/reshare/ugcPost ao vivo (captura não tem
   teste automático). **Assert end-to-end:** os engajadores de um post org ficam **não-vazios DEPOIS** do
   resolve+bind completo — não basta `resolveTarget` ter retornado dados (§12 B4).

---

## 10. Decisões para o dono

1. **Regen do golden-master:** preferir **via-2** (novas fixtures + novas chaves) e jamais `-u`. Só pedir regen
   explícito se a troca `VANITY→NAV` (passo 6) alterar o valor emitido do post member já snapshotado.
2. **Modelar identidade de org no export:** recomendado `author_type:"organization"` + `company_urn` (urn real
   `fsd_company/organization`) aditivos e opcionais; `vanity_name` = último segmento de `/company/<vanity>`.
3. **Modelar reshare:** reusar `reposted_by{name, original_author}` (já existe) + `type:"repost"`; engajamento mira o
   **post original**.
4. **Recapturar HAR com corpos** antes de escrever a extração org/reshare — o har atual é insuficiente (§12 B1/B6).
5. **Resolve via `feedDashUpdates` vs `feedDashReshareFeed`:** recomendado `feedDashUpdates` — **mas** a shape da
   resposta (legível vs. microSchema) é **não validada** (§12 B3); decidir se entra um decoder microSchema só após a
   recaptura. Não depender de `feedDashReshareFeed` (`endpoints.ts:50-55` shape não validado).
6. **Precedência de `reaction_breakdown`** quando SDUI-inline e resolve trazem ambos os contadores: recomendado
   `max-por-tipo` (richness só sobe) — decisão do dono, estende `#14 preserveMetrics` (§12 B7).

---

## 11. Riscos em aberto

- Org/reshare SDUI **não validável** sem nova captura (corpos do har removidos).
- `detectReshare` por substring "reposted" é locale-dependente (pt-BR "compartilhou isto"); SDUI microSchema pode não
  trazer o header → pode exigir 2º feed-actor estrutural.
- `feedDashReshareFeed` (`endpoints.ts:50-55`) tem shape `targetUrn` **não validado**; reshare já resolve por
  `feedDashUpdates`, então **não depender** do reshareFeed.
- `resolveTarget` org adiciona 1 request por post org → custo/ToS; manter dry-run default e baixo volume.
- Troca `VANITY→NAV` em `post-extractor.ts` é o único ponto realmente `affects-snapshot`; exige validação do node member.

---

## 12. Verification & open blockers (verdicts adversariais)

Esta seção registra o que **foi verificado contra evidência** vs. o que é **hipótese de design**, mais os blockers
levantados na revisão adversarial. **Onde a evidência refuta a spec, a spec acima foi corrigida** (claims marcadas
⚠️). Regra geral: **testes verdes ≠ captura funciona** — o `parser`/export pode passar no golden-master enquanto o
runtime de captura devolve vazio.

### 12.1 O que ESTÁ provado pelo `.har` atual

| Claim | Veredito | Evidência |
|---|---|---|
| Golden-master strategy (vias 1/2/3, sem `-u`, sem editar snapshot) | ✅ **OK** | Baseline `bun test` = 4 pass / 0 fail. `JSON.stringify` omite `undefined` → campos gated não alteram bytes dos 4 keys. via-2 confirmada empiricamente neste repo (Bun 1.3.14): chave nova escreve na 1ª run sem `-u` (`golden-master.test.ts:177-181`). via-3 reservada e proíbe auto-aprovação. |
| Campos novos (`author_type?`/`company_urn?`/`author_kind?`) sem colisão | ✅ **OK** | `grep` confirma que nenhum desses identificadores existe em `src/` ou `test/` hoje. |
| Change #3 (`process.ts type: pub.type ?? "original"` + gating) é byte-safe | ✅ **OK** | O único `type:"original"` hardcoded vive no path de busca (`process.ts:41`, `post-extractor.ts:67`); o snapshot `LinkedIn` (feed) deriva o type do parser, intocado. Member umar-waqas continua `"original"`. |
| `VANITY→NAV` está corretamente rotulado `affects-snapshot` (não `safe`) | ✅ **OK (classificação honesta)** | A fixture guarda o vanity como `linkedin.com/in/umar-waqas` sem `/company//school/` no node → o regex `NAV` renderia o **mesmo** `umar-waqas`; ainda assim a spec gateia por verificação do dono. |
| **MEMBER resolve direto** (`threadUrn=activity:7457919329506955265` → `total:15`) | ✅ **provado para ESTE post** | `voyagerSocialDashReactions` com o activity retorna 200, `paging.total=15`, body 71 KB com reactors. **MAS ver B2** — pode não generalizar. |

### 12.2 BLOQUEADORES (severity: blocker/major) — NÃO construir sem recaptura

**B1 — O sinal do classificador SDUI está AUSENTE da captura (blocker).**
Todos os corpos `search/results` no har têm **0 bytes** e `feed-actor=0` (`00-decode-har.py`: "0 bytes"; walk direto:
status 200, bodylen 0). O **único** sinal SDUI alegado (`NAV=/linkedin.com/(in|company|school)/<vanity>` escopado ao
node) **não pode ser localizado, escopado ou testado** — não há nodes feed-actor na captura. A **regra anti-hijack**
(§3 linha 110 — `/company/` no corpo não pode sequestrar o vanity) é a parte mais propensa a falha do design e **tem
ZERO dado para testar**.

**B2 — O resolve member-direto está CONTESTADO (major).**
A spec original dizia "member funciona direto, só org precisa de resolve". A memória `l3-replay-precisa-ugcpost` diz o
**oposto**: `threadUrn:<activity>` → **200 mas 0 elementos** de forma geral; os **três** endpoints sociais usam
`ugcPost`. O har só prova `total:15` para **um** post member. Risco: se **todos** os kinds precisam de resolve,
`resolveTarget` origina **~2 GETs autenticados por post** (não "1 por org") → custo ToS **~dobra** (B5). **Re-validar na
recaptura** antes de shippar o branch member como no-op-direto.

**B3 — `feedDashUpdates` não tem NENHUMA resposta capturada + shape provavelmente microSchema (major).**
`grep queryId=voyagerFeedDashUpdates` no har = **0 requests de rede**; os 15 matches são todos **símbolos de bundle JS**
(`feedDashUpdatesById`, etc.), não payloads. A claim "expõe o ugcPost/share em uma chamada, sem decoder microSchema"
(antiga decisão q5) repousa em **inferência de símbolo**, não em payload. A memória confirma: a resposta é
**microSchema-comprimida** → `linkedinFeedToPosts` (lê `included[]` legível) **não serve** sem decode. **Validar a shape
e o campo exato do inner urn na recaptura.** O `readInnerThreadUrn` deve lidar com **share E ugcPost** (o único shareUrn
real no har é um `urn:li:share` legado da família member), **nunca assumir ugcPost**.

**B4 — Re-keying ugcPost→activity_urn ausente → richness recuperada mas DESCARTADA (major).**
O export liga engajadores por `lstore.reactions[shareUrn] || lstore.reactions[activityUrn]` (`index.ts:313-320`). Posts
SDUI têm `share_urn` vazio → ligam **só** por `activity_urn`. Se `resolveTarget` troca o threadUrn para **ugcPost** no
org, o payload replicado fica keyado sob **ugcPost**, que **≠ activity_urn** → o lookup falha nos dois (shareUrn vazio,
activityUrn≠ugcPost). **Resultado: richness org buscada e DROPADA no bind** → viola Invariante #3 exatamente nos posts
que este feature mira. **Contrato faltante:** após o resolve org, **re-keyar** os engajadores de volta sob o
`activity_urn` que o post SDUI armazena. Adicionar **assert unit**: engajadores de um post org **não-vazios DEPOIS** do
resolve+bind, não só que o resolve retornou dados.

**B5 — Custo ToS subestimado (major).** Se B2 confirmar que member também precisa de resolve, o cap/dry-run deve
orçar **~2 GETs autenticados por target em TODOS os kinds**, não "1 por org". Manter dry-run default + baixo volume +
csrf via cookie (`csrf.ts`/`voyager-request.ts` já corretos).

**B6 — Reshare 100% não representado (blocker p/ reshare).** `grep reshareContext` = **0** no har. `detectReshare`
(substring "reposted"/"compartilhou", locale-dependent) e o modelo de 2 atores **não têm exemplo positivo nem
negativo**. Sem nodes feed-actor, não há fallback estrutural de "2º feed-actor". **Reshare é design-só até a recaptura.**

**B7 — Precedência de `reaction_breakdown` indefinida (major se org ganhar resolve).** Quando **duas** fontes de
breakdown existem para o mesmo `activity_urn` (contadores inline do SDUI vs. `reactionTypeCounts` do resolve),
falta uma **precedência definida**. §5 protege só o merge SDUI-interno, não SDUI-vs-resolve. **Definir**:
`resolve-wins-if-nonzero` / `max-por-tipo` (richness só **sobe**, nunca desce), estendendo o guard `#14 preserveMetrics`.

### 12.3 O que a recaptura DEVE conter (gate do passo 0)

Uma única captura "Save all as HAR with content" rolando uma SRP que produza, **com corpos não-vazios**:
1. ≥1 post **org** (`/company/`) com node feed-actor legível.
2. ≥1 **repost** (header de reshare + 2 atores).
3. ≥1 post **member** com `/company/<x>` **embutido no corpo** (fixture anti-hijack, B1).
4. Um `SocialDashReactions` **org** disparado (observar o **200-empty** que motiva o resolve, B2).
5. Uma resposta `voyagerFeedDashUpdates` **org** (confirmar shape micro vs. legível + campo do inner urn, B3).

Sem (1)–(5) os passos 3–5 da §9 ficam bloqueados. **Member resolve (passo 4 direto)** é a única coisa shippável com
confiança hoje — e mesmo essa gateada por B2.

---

## 13. Simplified design (inline ugcPost, 2026-06-05) — AUTORITATIVA

> **Esta seção substitui o design das §2 (bloco RESOLVE), §7.5 e os blockers B1/B2/B3/B5 da §12.** Fonte: captura ao
> vivo **#laraveldaysp** (bytes reais do stream SDUI da busca, "Save all as HAR with content"), que finalmente trouxe
> nós `feed-actor` legíveis **e** o `postThreadUrn` inline. As §1–§12 ficam como histórico; onde uma claim conflita
> com esta seção, **§13 vence**.

### 13.1 O que mudou (resumo da virada)

A premissa central das versões anteriores era: "para org (e talvez member) o `urn:li:activity` retorna 200-empty, logo
o Active Fetch precisa **resolver** o `ugcPost` interno via um endpoint de rede (`voyagerFeedDashUpdates`), cuja resposta
ainda seria **microSchema-comprimida** e exigiria um **decoder**". A captura ao vivo **refuta isso**:

- O `ugcPost` de **cada post** (member **e** org) já vem **INLINE no nó do stream SDUI** (`postThreadUrn`), no mesmo
  lote que descreve o post. **Não há nenhuma chamada de rede de resolve.**
- ➡️ **O estágio de resolve (`resolveTarget` + `feedDashUpdates`) é REMOVIDO.**
- ➡️ **O decoder microSchema é ELIMINADO** (não há resposta `feedDashUpdates` para decodificar; o stream SDUI já é
  legível pelo parser de busca).
- ➡️ B1 (sinal do classificador ausente) está **resolvido**: os nós `feed-actor` vêm com a `NavigateToUrl` real.
- ➡️ B2 (member precisa resolve?) e B3 (`feedDashUpdates` micro vs. legível) tornam-se **moot** — ninguém resolve
  via rede; o threadUrn (ugcPost) sai inline para todos os kinds.
- ➡️ B5 (custo ToS ~dobra) **cai**: zero GETs extras de resolve. O Active Fetch continua com 1 fan-out social por
  post (reactions/comments/reposts), agora chaveado pelo ugcPost inline — não há "2º GET por target".

### 13.2 Classificador member/organization (sinal real)

O `kind` e o `vanity_name` saem da **`NavigateToUrl` do bloco `feed-actor` DAQUELE post** — escopada ao nó, nunca por
varredura global do stream (anti-hijack: ver §13.5).

```
proto.sdui.actions.core.NavigateToUrl.url  →  classificar pelo 1º segmento de path:

   /company/<vanity>   →  kind = "organization"
   /school/<vanity>    →  kind = "organization"   (escola = org)
   /in/<vanity>        →  kind = "member"

   vanity_name = segmento de path após o /company|/school|/in/   (NUNCA slug do display name)
```

Exemplo real (captura #laraveldaysp):

```
NavigateToUrl "https://www.linkedin.com/company/he4rt/posts/"   → kind=organization, vanity="he4rt"
NavigateToUrl "https://www.linkedin.com/in/caio-barilli/"       → kind=member,       vanity="caio-barilli"
"3pontos3" idem he4rt (org, /company/3pontos3)
```

**O BUG que isto conserta:** o parser atual (`post-extractor.ts:47`) **fabrica** um urn/slug a partir do display name
(`name.toLowerCase().replace(/\s+/g,"_")` → ex.: `heart_developers`). O vanity **real** é `he4rt`, lido do
`/company/he4rt` da NAV — **nunca** derivado do nome exibido.

Regex sugerido (escopado ao `rawObject` do nó feed-actor):
`/linkedin\.com\/(in|company|school)\/([A-Za-z0-9\-%]+)/` → `m[1]!=="in" ? "organization" : "member"`; vanity = `m[2]`.

### 13.3 Extração INLINE do ugcPost (sem resolve de rede)

Cada nó de post no stream carrega o `ugcPost` em `postThreadUrn`:

```json
"postThreadUrn": {
  "threadUrnUgcPostThreadUrn": {
    "__typename": "proto_com_linkedin_common_UserGeneratedContentPostUrn",
    "userGeneratedContentPostUrn": { "userGeneratedContentId": "7457926687662456833" }
  }
}
```

**Extração primária** (roda na linha crua do flight, escapada ou não):
`/userGeneratedContentId\\?":\\?"?(\d+)/` → o `ugcPostId`.

**Fallbacks no MESMO nó** (ordem de preferência), para robustez quando o shape do `postThreadUrn` variar:
1. URL canônica do post: `/posts/<slug>-ugcPost-(\d+)-<code>` → captura o id do ugcPost.
2. `"updateUrnLegacy":"urn:li:fsd_update:(urn:li:activity:<activityId>,MAIN_FEED,...)"` → captura o `activityId`
   (chave de bind do export; ver §13.6).

**Pares reais activity → ugcPost** (inputs de unit test):

| activity            | ugcPost             | autor        | kind          |
|---------------------|---------------------|--------------|---------------|
| 7457926735343390720 | 7457926687662456833 | he4rt        | organization  |
| 7460063264585109504 | 7460063098184556546 | 3pontos3     | organization  |
| 7458172623563145216 | 7458107717417873408 | caio-barilli | member        |

O `threadUrn` do Active Fetch passa a ser `urn:li:ugcPost:<ugcPostId>` lido inline — para **todos** os kinds. Sem
200-empty, sem segunda volta de rede.

### 13.4 Reshare — DEFERIDO (sem exemplo capturado)

A captura #laraveldaysp **não** trouxe nenhum reshare positivo. Portanto **reshare sai do escopo desta rodada**:
`detectReshare`, `type:"repost"` e `reposted_by{name,original_author}` ficam **DEFERIDOS** até uma captura com um
repost real (header de reshare + 2 atores).

⚠️ **Sinal NÃO-confiável (não usar):** `useRepostCta` e `shareBoxMode:"Repost"` **NÃO** indicam reshare — são apenas a
**afordância de UI do botão "repostar"**, presente em posts normais. Detectar reshare por esses campos produziria
falsos positivos em massa. Aguardar sinal estrutural real (header + 2º feed-actor) numa captura futura.

### 13.5 Anti-hijack (continua válido e agora COM dado)

A regra "escopar a NAV ao bloco `feed-actor` do post, nunca varrer o stream inteiro" deixou de ser hipótese: a fixture
de golden-master atual (`test/fixtures/linkedin-search-sdui.txt`) **já contém** um `/company/space-o-technologies`
dentro de uma `NavigateToUrl` **embutida no corpo do post member do Nehal Jani** (offset entre o feed-actor do Nehal e
o do Rechal), **não** num bloco de autor. Os 3 nós feed-actor da fixture são todos `/in/` (nehal-jani,
rechal-christian, umar-waqas). Logo o classificador **deve** ler a NAV do bloco feed-actor daquele post — se varrer
global, o `/company/space-o` sequestra o vanity do Nehal. Esta fixture serve como o **caso de teste anti-hijack** já
disponível no repo (sem precisar de nova captura).

### 13.6 Golden-master strategy (inalterada — aditivo-opcional, gated a org)

Reafirmando a §5 sob o novo design:

- Os novos campos — `author.author_type`, `author.company_urn`, o `vanity_name` corrigido e o `share_urn`/ugcPost —
  são **ADITIVOS e OPCIONAIS**, **populados SOMENTE para posts `organization`** (gated por `kind`). Posts `member`
  serializam **idênticos** ao de hoje (campos `undefined` → omitidos por `JSON.stringify`).
- **Verificação executada (2026-06-05):** a fixture de busca existente **NÃO contém nenhum post org-authored emitido**.
  O parser real emite 3 publications, **todas member** (nehal-jani, rechal-christian, umar-waqas); o único
  `/company/` da fixture (`space-o-technologies`) está **no corpo** do post do Nehal, não num bloco de autor (§13.5).
  ➡️ Logo o `vanity_name` corrigido e o `author_type` gated a org **não alteram** nenhuma das 4 chaves de snapshot
  (X, Instagram, LinkedIn, "LinkedIn (search)"). **Não editar snapshot; não rodar `-u`.**
- A chave "LinkedIn (search)" hoje emite **só** o post member umar-waqas (`type:"original"`, sem `author_type`/
  `company_urn`/`reposted_by`) → permanece **byte-idêntica**.
- Para cobrir org de verdade no oráculo: **nova fixture + nova chave** (`test("LinkedIn (search org)")`), escrita na
  1ª run sem `-u` (via-2 da §5), usando os bytes #laraveldaysp do he4rt/3pontos3.
- **Richness (#3) intacta:** o merge `preserveMetrics` / by-MAX de `reaction_breakdown`/`total_reactions`
  (`process.ts:73-110`) **não regride** — o ugcPost inline só **acrescenta** chave de bind; nada é rebaixado.

### 13.7 Impacto na sequência (§9) sob o design simplificado

- **Passo 0 (recaptura) — CUMPRIDO** pela captura #laraveldaysp; B1/B2/B3/B5 fechados (§13.1).
- **Passos 3–5 (extração org)** — DESBLOQUEADOS: classificar por NAV (§13.2) + ler ugcPost inline (§13.3); gated a org.
- **Passo 4 (Active Fetch)** — SIMPLIFICADO: `resolveTarget`/`feedDashUpdates`/decoder **removidos**; `targets.ts` lê
  `ugcPostUrn` inline e `endpoints.ts` usa `threadUrn = ugcPost`. **B4 (re-keying ugcPost→activity_urn) CONTINUA
  necessário** — o post SDUI ainda guarda `activity_urn`, então os engajadores buscados sob o ugcPost devem ser
  re-keyados sob o `activity_urn` no bind do export (`index.ts:313-320`), senão a richness é buscada e descartada.
- **Reshare (parte dos passos 3/5)** — DEFERIDO (§13.4).
- **Line-budget (§7.3) e decomposição** — inalterados: `process.ts` está em ~146 linhas; a lógica nova de
  classificação + extração inline nasce em **arquivo novo** `src/providers/linkedin/search/sdui/post-data.ts`.
