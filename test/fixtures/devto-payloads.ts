export const DEVTO_ARTICLE_ID = "123456";
export const devtoAnalyticsUrl = `https://dev.to/api/analytics/dashboard?article_id=${DEVTO_ARTICLE_ID}&start=2023-01-01`;
export const devtoReactionsUrl = `https://dev.to/reactions?article_id=${DEVTO_ARTICLE_ID}`;

export const devtoAnalyticsPayload = {
  totals: {
    comments: { total: 2 },
    follows: { total: 3 },
    reactions: {
      total: 5,
      like: 2,
      readinglist: 1,
      unicorn: 2,
      exploding_head: 0,
      raised_hands: 0,
      fire: 0,
      unique_reactors: 4,
    },
    page_views: {
      total: 120,
      average_read_time_in_seconds: 90,
      total_read_time_in_seconds: 10800,
    },
  },
  historical: {
    "2026-06-01": { reactions: { total: 3 } },
    "2026-06-03": { reactions: { total: 2 } },
  },
  follower_engagement: { total_followers: 42, engaged_followers: 5, ratio: 0.119 },
  referrers: { domains: [{ domain: "google.com", count: 10 }] },
};

export const devtoReactionsPayload = {
  current_user: { id: 894593 },
  reactions: [
    { id: 20700191, user_id: 894593, category: "unicorn", created_at: "2026-06-03T14:39:00.092Z" },
    { id: 20700192, user_id: 894594, category: "like", created_at: "2026-06-01T10:00:00.000Z" },
  ],
  article_reaction_counts: [
    { category: "like", count: 2 },
    { category: "unicorn", count: 2 },
  ],
};
