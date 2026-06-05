import type { SocialProvider } from "../shared/domain";
import type { RuntimeMessage } from "../shared/messages";

// Catálogo de estratégias de captura DECLARADAS por provider.
//
// Antes desta camada, interceptor/index.ts (MAIN) e content/index.ts (ISOLATED)
// carregavam um if-cascade por provider: cada provider espalhava seus matchers de
// endpoint, gates e scanners no meio do motor genérico. Aqui invertemos: cada
// provider declara COMO captura (via os tipos abaixo) num módulo capture.ts próprio,
// e os motores apenas iteram o registry e executam as estratégias do provider ativo.
//
// O protocolo de mensagens NÃO muda: os motores seguem emitindo exatamente
// CAPTURED_PAYLOAD / VISIBLE_PUBLICATIONS / VISIBLE_COMMENTS para o background.
// As estratégias descrevem só a DETECÇÃO/EXTRAÇÃO; o empacotamento em mensagem
// continua sendo responsabilidade dos motores.

// --- networkIntercept (MAIN world) -----------------------------------------
// Roda no patch de fetch/XHR. match() decide se a requisição interessa e qual o
// endpoint inicial; gate() (opcional) inspeciona o payload da RESPOSTA para decidir
// se vale postar (Instagram usa markers); rename() (opcional) reclassifica o endpoint
// a partir do payload (Instagram infere o nome real do endpoint pelo conteúdo).

export type NetworkMatch = {
  endpoint: string;
  // Como o interceptor lê o corpo da resposta. Default "json" (clone.json()).
  // "text" (clone.text()) para respostas não-JSON, ex.: o stream SDUI/Flight da
  // busca do LinkedIn. Hint genérico: nenhum motor conhece redes individuais.
  responseFormat?: "json" | "text";
  // Subconjunto de headers da REQUISIÇÃO que o provider quer encaminhar ao SW (harvest L3).
  // O interceptor apenas repassa — não conhece quais headers cada rede usa. Ex. (LinkedIn):
  // { "x-li-track": "..." } para o clientVersion. Por design, NUNCA inclua o csrf aqui.
  signature?: Record<string, string>;
};

export type NetworkInterceptStrategy = {
  kind: "networkIntercept";
  match: (
    url: string,
    init?: { body?: BodyInit | null; headers?: Record<string, string> } | null,
  ) => NetworkMatch | null;
  gate?: (payload: unknown, endpoint: string | null) => boolean;
  rename?: (payload: unknown, endpoint: string | null) => string;
};

// --- ssrScriptScan (ISOLATED world) ----------------------------------------
// Varre <script> da página (SSR/hidratação) e, quando o texto casa, devolve o
// endpoint. O motor faz o JSON.parse e emite CAPTURED_PAYLOAD com o objeto parseado.
// O contexto é GENÉRICO (pathname/href da página); qualquer derivação específica do
// provider (ex.: shortcode do Instagram) fica dentro do match da estratégia.

export type SsrScriptScanContext = {
  pathname: string;
  href: string;
};

export type SsrScriptScanStrategy = {
  kind: "ssrScriptScan";
  match: (text: string, ctx: SsrScriptScanContext) => NetworkMatch | null;
};

// --- embeddedCodeScan (ISOLATED world) -------------------------------------
// Varre elementos embutidos (ex.: <code id="bpr-guid-*"> do LinkedIn) que carregam
// payloads JSON escapados em HTML. selector é o seletor grosso que o motor usa em
// querySelectorAll (scan inicial + nós aninhados adicionados); match() é o predicate
// fino aplicado a nós recém-adicionados; parse() devolve o endpoint + o payload já
// desserializado/normalizado, ou null se não for relevante.

export type EmbeddedCodeMatch = {
  endpoint: string;
  payload: unknown;
  url?: string;
};

export type EmbeddedCodeScanStrategy = {
  kind: "embeddedCodeScan";
  selector: string;
  match: (el: Element) => boolean;
  parse: (text: string, el: Element) => EmbeddedCodeMatch | null;
};

// --- liveDomScrape (ISOLATED world) ----------------------------------------
// Lê o DOM já renderizado para reconstruir itens (ordem de publicações, comentários
// visíveis) que não vêm por rede. extract() devolve os itens; signature() produz uma
// assinatura estável para o motor só reemitir quando mudar; toMessage() empacota os
// itens na mensagem de runtime (envelope + guards específicos do scrape) ou devolve
// null para pular. O endpoint lógico (ex.: "VISIBLE_PUBLICATIONS"/"VISIBLE_COMMENTS")
// identifica o scrape e dá ao motor uma chave estável para dedupe.

export type LiveDomScrapeStrategy<TItem = unknown> = {
  kind: "liveDomScrape";
  endpoint: string;
  extract: (doc: Document) => TItem[];
  signature: (items: TItem[]) => string;
  toMessage: (items: TItem[], doc: Document) => RuntimeMessage | null;
};

// O motor trata os itens de um scrape como opacos (extract -> signature -> toMessage,
// sempre sobre o MESMO array), então o tipo do item é existencial na fronteira do
// registry/motor. Cada provider mantém o tipo preciso ao DECLARAR seu scrape; o `any`
// aqui é só para vencer a invariância de TItem (que aparece em posição contravariante
// em signature/toMessage), e nunca vaza para o código que constrói as estratégias.
export type AnyLiveDomScrapeStrategy = LiveDomScrapeStrategy<any>;

export type CaptureStrategy =
  | NetworkInterceptStrategy
  | SsrScriptScanStrategy
  | EmbeddedCodeScanStrategy
  | AnyLiveDomScrapeStrategy;

// Faceta de captura de um provider: as estratégias que ele declara para cada motor.
// O motor MAIN consome networkIntercept; o motor ISOLATED consome o restante.
export type CaptureFacet = {
  id: SocialProvider;
  networkIntercept?: NetworkInterceptStrategy;
  ssrScriptScan?: SsrScriptScanStrategy;
  embeddedCodeScan?: EmbeddedCodeScanStrategy;
  liveDomScrapes?: AnyLiveDomScrapeStrategy[];
};
