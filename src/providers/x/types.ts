import type { SocialComment, SocialEngagement, SocialPublication } from "../../shared/domain/core";

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

export type XStore = {
  tweets: Record<string, TweetData>;
  favoriters: Record<string, Favoriter[]>;
  accountInfo: AccountInfo | null;
  communityReplies: Record<string, SocialPublication>;
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
};

export type ExportV3PlatformX = {
  content: TweetData[];
  engagers: {
    likes_by_tweet: Record<string, Favoriter[]>;
    replies: SocialPublication[];
  };
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
