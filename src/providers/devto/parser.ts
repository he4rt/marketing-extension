import type {
  DevToArticleAnalytics,
  DevToReactionCounts,
  SocialEngagement,
} from "../../shared/domain";

type RawReactionCounts = {
  total?: number;
  like?: number;
  readinglist?: number;
  unicorn?: number;
  exploding_head?: number;
  raised_hands?: number;
  fire?: number;
  unique_reactors?: number;
};

type RawAnalytics = {
  totals?: {
    comments?: { total?: number };
    follows?: { total?: number };
    reactions?: RawReactionCounts;
    page_views?: {
      total?: number;
      average_read_time_in_seconds?: number;
      total_read_time_in_seconds?: number;
    };
  };
  historical?: Record<string, unknown>;
  follower_engagement?: {
    total_followers?: number;
    engaged_followers?: number;
    ratio?: number;
  };
  referrers?: { domains?: unknown[] };
};

type RawReaction = {
  id?: number;
  user_id?: number;
  category?: string;
  created_at?: string;
};

export type RawReactionsPayload = {
  current_user?: { id?: number };
  reactions?: RawReaction[];
  article_reaction_counts?: { category: string; count: number }[];
};

function parseReactionCounts(raw: RawReactionCounts | undefined): DevToReactionCounts {
  const r = raw ?? {};
  return {
    total: r.total ?? 0,
    like: r.like ?? 0,
    readinglist: r.readinglist ?? 0,
    unicorn: r.unicorn ?? 0,
    exploding_head: r.exploding_head ?? 0,
    raised_hands: r.raised_hands ?? 0,
    fire: r.fire ?? 0,
    unique_reactors: r.unique_reactors ?? 0,
  };
}

export function parseAnalytics(articleId: string, raw: unknown): DevToArticleAnalytics | null {
  const r = raw as RawAnalytics;
  if (!r?.totals) return null;
  const t = r.totals;
  const result: DevToArticleAnalytics = {
    article_id: articleId,
    totals: {
      comments: { total: t.comments?.total ?? 0 },
      follows: { total: t.follows?.total ?? 0 },
      reactions: parseReactionCounts(t.reactions),
      page_views: {
        total: t.page_views?.total ?? 0,
        average_read_time_in_seconds: t.page_views?.average_read_time_in_seconds ?? 0,
        total_read_time_in_seconds: t.page_views?.total_read_time_in_seconds ?? 0,
      },
    },
    historical: r.historical ?? {},
  };
  if (r.follower_engagement) {
    result.follower_engagement = {
      total_followers: r.follower_engagement.total_followers ?? 0,
      engaged_followers: r.follower_engagement.engaged_followers ?? 0,
      ratio: r.follower_engagement.ratio ?? 0,
    };
  }
  if (r.referrers) {
    result.referrers = { domains: r.referrers.domains ?? [] };
  }
  return result;
}

export function parseReactions(
  articleId: string,
  raw: unknown,
  capturedAt: string,
): SocialEngagement[] {
  const payload = raw as RawReactionsPayload;
  if (!Array.isArray(payload?.reactions)) return [];

  const results: SocialEngagement[] = [];
  for (const r of payload.reactions) {
    if (!r.id || !r.user_id) continue;
    const userId = String(r.user_id);
    results.push({
      engagement_id: String(r.id),
      publication_id: articleId,
      provider: "devto",
      kind: "like",
      actor: {
        provider: "devto",
        provider_user_id: userId,
        username: userId,
        name: userId,
        avatar_url: "",
      },
      engaged_at: r.created_at ?? null,
      captured_at: capturedAt,
    });
  }
  return results;
}

export function articleIdFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("article_id");
  } catch {
    return null;
  }
}
