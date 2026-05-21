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

export type EndpointStore = {
  count: number;
  lastSeen: null | string;
  payloads: unknown[];
};

export type BackgroundStore = {
  accountInfo: AccountInfo | null;
  communityReplies: Record<string, TweetData>;
  endpoints: Record<string, EndpointStore>;
  favoriters: Record<string, Favoriter[]>;
  lastUpdated: null | string;
  trackedHandle: string;
  tweets: Record<string, TweetData>;
};

export type ExportJSON = {
  community_replies: TweetData[];
  exported_at: string;
  favoriters_by_tweet: Record<string, Favoriter[]>;
  summary: {
    avg_likes_per_original: number;
    avg_views_per_original: number;
    top_tweet_by_likes: null | string;
    top_tweet_by_views: null | string;
    total_community_replies: number;
    total_likes: number;
    total_original: number;
    total_quotes: number;
    total_replies_from_account: number;
    total_reply_engagement: number;
    total_retweets: number;
    total_tweets: number;
    total_views: number;
    unique_engagers: number;
  };
  tracked_account: AccountInfo | { screen_name: string };
  tweets: TweetData[];
};
