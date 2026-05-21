import type { SocialActor, SocialMetrics, SocialProvider } from "../../shared/domain";

export type AnyRecord = Record<string, any>;

export function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as AnyRecord;
}

export function emptyMetrics(): SocialMetrics {
  return {
    bookmark_count: 0,
    comment_count: 0,
    like_count: 0,
    quote_count: 0,
    reply_count: 0,
    repost_count: 0,
    retweet_count: 0,
    save_count: 0,
    view_count: 0,
  };
}

export function actorKey(
  provider: SocialProvider,
  actor: Pick<SocialActor, "provider_user_id" | "username">,
) {
  return `${provider}:${actor.provider_user_id || actor.username}`;
}

export function publicationKey(provider: SocialProvider, publicationId: string) {
  return `${provider}:${publicationId}`;
}

export function compactText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function toIsoFromUnix(value: unknown) {
  if (typeof value !== "number") return "";
  return new Date(value * 1000).toISOString();
}

export function walkObjects(value: unknown, visitor: (record: AnyRecord) => void) {
  const seen = new WeakSet<object>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) visitor(node as AnyRecord);
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      walk(child);
    }
  };
  walk(value);
}

export function findFirstRecord(value: unknown, predicate: (record: AnyRecord) => boolean) {
  let found: AnyRecord | null = null;
  walkObjects(value, (record) => {
    if (!found && predicate(record)) found = record;
  });
  return found;
}
