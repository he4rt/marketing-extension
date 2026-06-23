import type {
  ExportSummaryInstagram,
  ExportV3PlatformInstagram,
  InstagramStore,
} from "../../providers/instagram/types";
import type {
  ExportSummaryLinkedin,
  ExportV3PlatformLinkedin,
  LinkedInStore,
} from "../../providers/linkedin/types";
import type { ExportSummaryX, ExportV3PlatformX, XStore } from "../../providers/x/types";

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

export type NormalizedStore = {
  publications: Record<string, SocialPublication>;
  commentsByPublication: Record<string, SocialComment[]>;
  engagementsByPublication: Record<string, SocialEngagement[]>;
  extra?: unknown;
};

export type ScopeProvenance = { mode: string; value: string };

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

  provenance: Partial<Record<SocialProvider, Record<string, ScopeProvenance>>>;
};

// Export v3 ------------------------------------------------------------------

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

export type ExportV3PerPlatform = {
  x: ExportV3PlatformX;
  instagram: ExportV3PlatformInstagram;
  linkedin: ExportV3PlatformLinkedin;
};

export type ExportJSON = {
  schema_version: 3;
  meta: ExportV3Meta;
  per_platform: ExportV3PerPlatform;
  unified: ExportV3Unified;
};
