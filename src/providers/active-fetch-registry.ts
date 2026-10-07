import type { ActiveFetchStrategy } from "./devto/active-fetch";
import { devtoActiveFetchStrategy } from "./devto/active-fetch";

export const ACTIVE_FETCH_REGISTRY: Record<string, ActiveFetchStrategy> = {
  devto: devtoActiveFetchStrategy,
};

export function getActiveFetchStrategy(provider: string): ActiveFetchStrategy | null {
  return ACTIVE_FETCH_REGISTRY[provider] ?? null;
}
