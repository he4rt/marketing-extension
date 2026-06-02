export type SocialProvider = "instagram" | "linkedin" | "x";

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

  // Provenance do Scope (#9): qual modo/valor de coleta capturou esta publicação.
  // Campos INTERNOS ao store — o exporter v3 NÃO os inclui, então permanecem
  // opcionais e fora do golden-master.
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

export type LinkedInStore = {
  posts: Record<string, LinkedInPostData>;
  reactions: Record<string, LinkedInEngagerStore>;
  reposts: Record<string, LinkedInRepostStore>;
  comments: Record<string, LinkedInCommentStore>;
  commentReactions: Record<string, { users: SocialActor[] }>;
  accountInfo: TrackedProfile | null;
  feedOrder: string[];
};

export type NormalizedStore = {
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
};

// Main store ----------------------------------------------------------------

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
  };

  // Legacy flat stores (kept during migration, written in parallel)
  accountInfo: AccountInfo | null;
  favoriters: Record<string, Favoriter[]>;
  tweets: Record<string, TweetData>;
  communityReplies: Record<string, SocialPublication>;
  instagramPublicationIdsByShortcode: Record<string, string>;
  instagramVisiblePublications: InstagramStore["visiblePublications"];
  instagramVisibleComments: InstagramStore["visibleComments"];
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
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
