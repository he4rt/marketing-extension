import type {
  SocialActor,
  SocialComment,
  SocialEngagement,
  SocialPublication,
  SocialPublicationType,
} from "../../shared/domain/core";

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

export type ExportInstagramPost = SocialPublication & {
  engagers: {
    likes: SocialActor[];
    comments: import("../../shared/domain/core").ExportComment[];
  };
};

export type ExportV3PlatformInstagram = {
  content: ExportInstagramPost[];
};

export type ExportSummaryInstagram = {
  total_content: number;
  total_likes: number;
  total_comments: number;
  total_views: number;
};
