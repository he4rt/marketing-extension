import type {
  ExportComment,
  NormalizedStore,
  SocialActor,
  SocialComment,
  TrackedProfile,
} from "../../shared/domain/core";

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

export type LinkedInExtra = {
  posts: Record<string, LinkedInPostData>;
  reactions: Record<string, LinkedInEngagerStore>;
  reposts: Record<string, LinkedInRepostStore>;
  comments: Record<string, LinkedInCommentStore>;
  commentReactions: Record<string, { users: SocialActor[] }>;
  accountInfo: TrackedProfile | null;
  feedOrder: string[];
  searchUnreadable?: number;
};

export type LinkedInStore = NormalizedStore & {
  extra: LinkedInExtra;
};

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

export type ExportLinkedInPost = Omit<LinkedInPostData, "engagers"> & {
  engagers: {
    reactions: LinkedInReactionUser[];
    reposts: LinkedInRepostEntry[];
    comments: ExportComment[];
  };
  engagement_metrics: LinkedInEngagementMetrics;
  provenance?: import("../../shared/domain/core").ScopeProvenance;
};

export type ExportV3PlatformLinkedin = {
  content: ExportLinkedInPost[];
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
