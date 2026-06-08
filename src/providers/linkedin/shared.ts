import type { BackgroundStore } from "../../shared/domain";

export const SEARCH_ENDPOINT = "searchResultsContent";

export function resolvePublicationId(store: BackgroundStore, urn: string): string {
  const pub = Object.values(store.platforms.linkedin.publications).find(
    (p) =>
      p.provider === "linkedin" && (p.publication_id === urn || p.reposted_publication_id === urn),
  );
  return pub?.publication_id || urn;
}
