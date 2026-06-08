export type SocialProvider = "devto" | "instagram" | "linkedin" | "x";

export type SocialActor = {
  avatar_url: string;
  followers_count?: number;
  following?: boolean;
  full_name?: string;
  is_private?: boolean;
  is_verified?: boolean;
  name: string;
  provider: SocialProvider;
  provider_user_id: string;
  username: string;
};

export type SocialPublicationType =
  | "carousel"
  | "image"
  | "original"
  | "quote"
  | "reel"
  | "reply"
  | "repost"
  | "retweet"
  | "unknown"
  | "video";

export type SocialMetrics = {
  bookmark_count: number;
  comment_count: number;
  like_count: number;
  quote_count: number;
  reply_count: number;
  repost_count: number;
  retweet_count: number;
  save_count: number;
  view_count: number;
};

export type SocialPublication = {
  author: SocialActor;
  capture_order?: number;
  capture_priority?: number;
  captured_at?: string;
  visible_order?: number;
  visible_url?: string;
  created_at: string;
  hashtags: string[];
  lang?: string;
  media_count: number;
  metrics: SocialMetrics;
  provider: SocialProvider;
  publication_id: string;
  is_placeholder?: boolean;
  raw_type?: string;
  source?: string;
  text: string;
  type: SocialPublicationType;
  url: string;
  urls: string[];
  user_mentions: Array<{ name: string; username: string }>;

  in_reply_to_publication_id?: null | string;
  in_reply_to_username?: null | string;
  quoted_publication_id?: null | string;
  reposted_publication?: Pick<SocialPublication, "author" | "metrics" | "publication_id" | "text">;
  reposted_publication_id?: null | string;
  shortcode?: string;

  // Provenance do Scope (#9). A Provenance ATIVA vive em BackgroundStore.provenance
  // (mapa por publicação), de propósito fora da publicação. No v3 ela já é lida por
  // buildPlatformDataLinkedin e anexada como ExportLinkedInPost.provenance — mas SÓ
  // para o modo "search" (#5/#14); o modo "profile" permanece interno (byte-compat).
  // Estes campos inline (scope_mode/scope_value) seguem reservados para quando o v4
  // promover a Provenance a campo da própria SocialPublication, para todos os modos.
  scope_mode?: string;
  scope_value?: string;
};

export type SocialComment = {
  author: SocialActor;
  captured_at?: string;
  comment_id: string;
  created_at: string;
  like_count: number;
  parent_comment_id: null | string;
  provider: SocialProvider;
  publication_id: string;
  relative_created_at?: string;
  source?: string;
  text: string;
};

export type SocialEngagement = {
  actor: SocialActor;
  captured_at?: string;
  engaged_at?: null | string;
  engagement_id: string;
  kind: "comment" | "like";
  provider: SocialProvider;
  publication_id: string;
};

export type TrackedProfile = {
  avatar_url: string;
  description: string;
  followers_count: number;
  following_count: number;
  is_verified?: boolean;
  name: string;
  provider: SocialProvider;
  provider_user_id: string;
  statuses_count?: number;
  username: string;
};

export type EndpointStore = {
  count: number;
  endpoint: string;
  lastSeen: null | string;
  payloads: unknown[];
  provider: SocialProvider;
};

// Per-platform stores --------------------------------------------------------

export type XStore = {
  tweets: Record<string, TweetData>;
  favoriters: Record<string, Favoriter[]>;
  accountInfo: AccountInfo | null;
  communityReplies: Record<string, SocialPublication>;
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
};

export type InstagramStore = {
  publicationIdsByShortcode: Record<string, string>;
  visiblePublications: Array<{
    author?: { avatar_url?: string; name?: string; username?: string };
    mediaType?: Extract<SocialPublicationType, "carousel" | "image" | "reel" | "unknown" | "video">;
    metrics?: { comment_count?: number; like_count?: number };
    shortcode: string;
    text?: string;
    url: string;
  }>;
  visibleComments: Array<{
    author: SocialActor;
    captured_at: string;
    comment_id: string;
    like_count: number;
    parent_comment_id: null | string;
    publication_shortcode: string;
    relative_created_at?: string;
    source: string;
    text: string;
  }>;
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
};

export type LinkedInPostData = {
  id: string;
  activity_urn: string;
  share_urn: string;
  text: string;
  type: "original" | "repost";
  author: {
    urn: string;
    name: string;
    headline: string;
    avatar_url: string;
    vanity_name: string;
  };
  metrics: {
    like_count: number;
    comment_count: number;
    share_count: number;
    total_reactions: number;
    reaction_breakdown: Record<string, number>;
  };
  hashtags: string[];
  media: Array<{ type: string; url: string; width: number; height: number }>;
  created_at: string;
  timestamp_text: string;
  source: string;
  reposted_by?: { name: string; original_author: string };
};

export type LinkedInEngagerStore = {
  total: number;
  lastStart: number;
  users: SocialActor[];
};

export type LinkedInRepostStore = {
  total: number;
  lastStart: number;
  users: LinkedInRepostEntry[];
};

export type LinkedInCommentStore = {
  total: number;
  lastStart: number;
  items: SocialComment[];
};

// Riqueza específica do LinkedIn que NÃO cabe no shape normalizado
// (publications/comments/engagements). Vive no campo `extra` do NormalizedStore,
// tipado na borda do provider. Aqui moram reaction_breakdown/total_reactions
// (em posts[].metrics), a ordem do feed, reaction_type por usuário, o payload
// completo de reposts/ACTOR_COMPONENT, reações em comentários e o accountInfo
// que vira o trackedAccountUrn de audience_interactions.
export type LinkedInExtra = {
  posts: Record<string, LinkedInPostData>;
  reactions: Record<string, LinkedInEngagerStore>;
  reposts: Record<string, LinkedInRepostStore>;
  comments: Record<string, LinkedInCommentStore>;
  commentReactions: Record<string, { users: SocialActor[] }>;
  accountInfo: TrackedProfile | null;
  feedOrder: string[];
  // Acumulador de nós SDUI em "drift" (shape irreconhecível pelo parser da busca) — os
  // "ilegíveis" de #18. Cresce a cada captura `searchResultsContent`; lido pelo controller
  // p/ o popup exibir "N posts · M ilegíveis (parser drift)". Volátil (vive no store do SW),
  // não vaza para o export v3. Opcional p/ não inflar fixtures profile-puro (= undefined).
  searchUnreadable?: number;
};

export type NormalizedStore = {
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
  // Aditivo/opcional: bolsão tipado na borda do provider para riqueza que não
  // cabe no shape normalizado. x/instagram não o usam (fica undefined); LinkedIn
  // guarda aqui seu store bespoke (LinkedInExtra). NÃO vaza para o export v3.
  extra?: unknown;
};

// O store do LinkedIn agora É um NormalizedStore com o extra obrigatório e tipado.
// O shape normalizado (publications/commentsByPublication/engagementsByPublication)
// herdado de NormalizedStore é a fonte per-platform; a riqueza bespoke do LinkedIn
// (reaction_breakdown, feedOrder, reposts, etc.) fica em `extra`.
export type LinkedInStore = NormalizedStore & {
  extra: LinkedInExtra;
};

// DevTo types ---------------------------------------------------------------

export type DevToReactionCounts = {
  total: number;
  like: number;
  readinglist: number;
  unicorn: number;
  exploding_head: number;
  raised_hands: number;
  fire: number;
  unique_reactors: number;
};

export type DevToArticleAnalytics = {
  article_id: string;
  totals: {
    comments: { total: number };
    follows: { total: number };
    reactions: DevToReactionCounts;
    page_views: {
      total: number;
      average_read_time_in_seconds: number;
      total_read_time_in_seconds: number;
    };
  };
  historical: Record<string, unknown>;
  follower_engagement?: {
    total_followers: number;
    engaged_followers: number;
    ratio: number;
  };
  referrers?: { domains: unknown[] };
};

export type DevToExtra = {
  analytics: Record<string, DevToArticleAnalytics>;
};

export type DevToStore = NormalizedStore & {
  extra: DevToExtra;
};

// Main store ----------------------------------------------------------------

// Provenance do Scope (#9): para cada publicação capturada, registra QUAL modo de coleta
// (profile/…) e QUAL valor (handle/perfil) a trouxe. No v3 é LIDO por
// buildPlatformDataLinkedin (#5/#14) e anexado a ExportLinkedInPost.provenance — mas
// SÓ quando mode === "search"; o modo "profile" continua interno (byte-compat dos
// snapshots profile-puro). Sem entrada no mapa → a chave nem aparece no item exportado.
export type ScopeProvenance = { mode: string; value: string };

export type BackgroundStore = {
  activeProvider: null | SocialProvider;
  archivedEndpoints: Record<string, EndpointStore>;
  endpoints: Record<string, EndpointStore>;
  lastUpdated: null | string;
  nextCaptureOrder: number;
  pageSessionKey: string;
  pageSessionKeys: Partial<Record<SocialProvider, string>>;
  providerPageUrls: Partial<Record<SocialProvider, string>>;
  trackedHandle: string;
  trackedHandles: Partial<Record<SocialProvider, string>>;
  trackedProfiles: Partial<Record<SocialProvider, TrackedProfile>>;

  platforms: {
    x: XStore;
    instagram: InstagramStore;
    linkedin: LinkedInStore;
    devto: DevToStore;
  };

  // Provenance por publicação, chaveada por publicationKey(provider, id). Ver ScopeProvenance.
  provenance: Partial<Record<SocialProvider, Record<string, ScopeProvenance>>>;
};

// Export v3 ------------------------------------------------------------------

export type LinkedInReactionUser = {
  urn: string;
  name: string;
  headline: string;
  avatar_url: string;
  navigation_url: string;
  reaction_type: string;
};

export type LinkedInRepostEntry = {
  urn?: string;
  name?: string;
  avatar_url?: string;
  profile_link?: string;
  // ACTOR_COMPONENT (reshared post)
  id?: string;
  activity_urn?: string;
  share_urn?: string;
  text?: string;
  type?: string;
  author?: LinkedInPostData["author"];
  metrics?: LinkedInPostData["metrics"];
  hashtags?: LinkedInPostData["hashtags"];
  media?: LinkedInPostData["media"];
  post_not_found?: boolean;
  reshare_ref?: string;
};

export type LinkedInEngagementMetrics = {
  real_comments: number;
  replies: number;
  unique_commenters_count: number;
  unique_reacters_count: number;
  unique_engagers_count: number;
  audience_interactions: number;
};

export type ExportComment = {
  comment_id: string;
  author: SocialActor;
  text: string;
  created_at: string;
  like_count?: number;
  reactions?: { total: number; types: { type: string; count: number }[] };
  reaction_users?: SocialActor[];
  replies: ExportComment[];
};

export type ExportV3Meta = {
  exported_at: string;
  handles: Partial<Record<SocialProvider, string>>;
  profiles: Partial<Record<SocialProvider, TrackedProfile | { username: string }>>;
};

export type ExportV3PlatformX = {
  content: TweetData[];
  engagers: {
    likes_by_tweet: Record<string, Favoriter[]>;
    replies: SocialPublication[];
  };
};

export type ExportInstagramPost = SocialPublication & {
  engagers: {
    likes: SocialActor[];
    comments: ExportComment[];
  };
};

export type ExportV3PlatformInstagram = {
  content: ExportInstagramPost[];
};

export type ExportLinkedInPost = Omit<LinkedInPostData, "engagers"> & {
  engagers: {
    reactions: LinkedInReactionUser[];
    reposts: LinkedInRepostEntry[];
    comments: ExportComment[];
  };
  engagement_metrics: LinkedInEngagementMetrics;
  // Provenance do Scope (#5/#14): ADITIVA no v3. Presente SÓ quando
  // store.provenance.linkedin tiver a chave E o mode for "search" (ver
  // buildPlatformDataLinkedin). Ausente em posts profile-puro → byte-compat.
  provenance?: ScopeProvenance;
};

export type ExportV3PlatformLinkedin = {
  content: ExportLinkedInPost[];
};

export type ExportV3PerPlatform = {
  x: ExportV3PlatformX;
  instagram: ExportV3PlatformInstagram;
  linkedin: ExportV3PlatformLinkedin;
};

export type ExportSummaryX = {
  total_content: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  total_quotes: number;
  total_bookmarks: number;
  total_views: number;
};

export type ExportSummaryInstagram = {
  total_content: number;
  total_likes: number;
  total_comments: number;
  total_views: number;
};

export type ExportSummaryLinkedin = {
  total_content: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_reaction_users: number;
  total_repost_users: number;
  total_comment_items: number;
  total_comment_reaction_users: number;
  total_audience_interactions: number;
};

export type ExportSummaryAll = {
  total_content: number;
  total_likes: number;
  total_comments: number;
  unique_engagers: number;
};

export type ExportV3Summary = {
  all: ExportSummaryAll;
  by_platform: {
    x?: ExportSummaryX;
    instagram?: ExportSummaryInstagram;
    linkedin?: ExportSummaryLinkedin;
  };
};

export type ExportV3Unified = {
  summary: ExportV3Summary;
};

export type ExportJSON = {
  schema_version: 3;
  meta: ExportV3Meta;
  per_platform: ExportV3PerPlatform;
  unified: ExportV3Unified;
};

// Legacy X types (keep unchanged) ------------------------------------------

export type TweetType = "original" | "quote" | "reply" | "retweet";

export type TweetAuthor = {
  avatar_url: string;
  followers_count: number;
  is_blue_verified: boolean;
  name: string;
  rest_id: string;
  screen_name: string;
};

export type TweetMetrics = {
  bookmark_count: number;
  favorite_count: number;
  quote_count: number;
  reply_count: number;
  retweet_count: number;
  view_count: number;
};

export type TweetData = {
  author: TweetAuthor;
  created_at: string;
  hashtags: string[];
  in_reply_to_screen_name: null | string;
  in_reply_to_tweet_id: null | string;
  lang: string;
  media_count: number;
  metrics: TweetMetrics;
  quoted_tweet_id: null | string;
  retweeted_tweet?: Pick<TweetData, "author" | "metrics" | "text" | "tweet_id">;
  retweeted_tweet_id: null | string;
  source: string;
  text: string;
  tweet_id: string;
  type: TweetType;
  urls: string[];
  user_mentions: Array<{ name: string; screen_name: string }>;
};

export type AccountInfo = {
  avatar_url: string;
  description: string;
  followers_count: number;
  friends_count: number;
  is_blue_verified?: boolean;
  name: string;
  rest_id: string;
  screen_name: string;
  statuses_count: number;
};

export type Favoriter = {
  followed_by: boolean;
  followers_count: number;
  following: boolean;
  is_blue_verified: boolean;
  name: string;
  rest_id: string;
  screen_name: string;
};
