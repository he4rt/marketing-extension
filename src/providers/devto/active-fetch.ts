export type DevToAuth = "api-key" | "cookie";

export type EnumeratedTarget = { id: string; meta?: unknown };

export type ActiveFetchRequest = {
  endpoint: string;
  url: string;
  auth: DevToAuth;
  afkSafe: boolean;
};

export type ActiveFetchStrategy = {
  kind: "activeFetch";
  enumerate: (ctx: { apiKey: string | null }) => Promise<EnumeratedTarget[]>;
  requestsFor: (target: EnumeratedTarget) => ActiveFetchRequest[];
};

export type ActiveFetchStatus = {
  collected: number;
  articles: number;
  reactions: number;
  sessionNeeded?: boolean;
  apiKeyInvalid?: boolean;
};

export const devtoActiveFetchStrategy: ActiveFetchStrategy = {
  kind: "activeFetch",
  async enumerate({ apiKey }) {
    if (!apiKey) return [];
    const res = await fetch("https://dev.to/api/articles/me", {
      headers: { "api-key": apiKey },
    });
    if (!res.ok) return [];
    const articles = (await res.json()) as Array<{ id: number }>;
    return articles.map((a) => ({ id: String(a.id) }));
  },
  requestsFor(target) {
    return [
      {
        endpoint: "analytics",
        url: `https://dev.to/api/analytics/dashboard?article_id=${target.id}`,
        auth: "api-key",
        afkSafe: true,
      },
      {
        endpoint: "reactions",
        url: `https://dev.to/reactions?article_id=${target.id}`,
        auth: "cookie",
        afkSafe: false,
      },
    ];
  },
};
