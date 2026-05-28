export type SocialProvider = "instagram" | "x";

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

  // Provider-specific optional fields kept normalized enough for ingestion.
  in_reply_to_publication_id?: null | string;
  in_reply_to_username?: null | string;
  quoted_publication_id?: null | string;
  reposted_publication?: Pick<SocialPublication, "author" | "metrics" | "publication_id" | "text">;
  reposted_publication_id?: null | string;
  shortcode?: string;
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

export type BackgroundStore = {
  commentsByPublication: Record<string, SocialComment[]>;
  communityReplies: Record<string, SocialPublication>;
  endpoints: Record<string, EndpointStore>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
  instagramPublicationIdsByShortcode: Record<string, string>;
  instagramVisiblePublications: Array<{
    author?: {
      avatar_url?: string;
      name?: string;
      username?: string;
    };
    mediaType?: Extract<SocialPublicationType, "carousel" | "image" | "reel" | "unknown" | "video">;
    metrics?: {
      comment_count?: number;
      like_count?: number;
    };
    shortcode: string;
    text?: string;
    url: string;
  }>;
  instagramVisibleComments: Array<{
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
  lastUpdated: null | string;
  nextCaptureOrder: number;
  pageSessionKey: string;
  publications: Record<string, SocialPublication>;
  trackedHandle: string;
  trackedProfiles: Partial<Record<SocialProvider, TrackedProfile>>;

  // Compatibility fields for existing X consumers while the export migrates.
  accountInfo: AccountInfo | null;
  favoriters: Record<string, Favoriter[]>;
  tweets: Record<string, TweetData>;
};

export type ExportJSON = {
  comments_by_publication: Record<string, SocialComment[]>;
  community_replies: SocialPublication[];
  engagements_by_publication: Record<string, SocialEngagement[]>;
  exported_at: string;
  favoriters_by_tweet: Record<string, Favoriter[]>;
  publications: SocialPublication[];
  raw_payloads: Record<string, EndpointStore>;
  schema_version: 2;
  summary: {
    providers: Record<
      SocialProvider,
      {
        total_comments: number;
        total_engagements: number;
        total_likes: number;
        total_publications: number;
        total_views: number;
        unique_engagers: number;
      }
    >;
    top_publication_by_likes: null | string;
    top_publication_by_views: null | string;
    total_comments: number;
    total_engagements: number;
    total_likes: number;
    total_publications: number;
    total_views: number;
    unique_engagers: number;

    // X-compatible summary names.
    avg_likes_per_original: number;
    avg_views_per_original: number;
    top_tweet_by_likes: null | string;
    top_tweet_by_views: null | string;
    total_community_replies: number;
    total_original: number;
    total_quotes: number;
    total_replies_from_account: number;
    total_reply_engagement: number;
    total_retweets: number;
    total_tweets: number;
  };
  tracked_account: AccountInfo | { screen_name: string };
  tracked_profiles: Partial<Record<SocialProvider, TrackedProfile | { username: string }>>;
  tweets: TweetData[];
};

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
