import type { SocialPublication } from "./domain";

export function sortPublications(publications: SocialPublication[]): SocialPublication[] {
  return [...publications].sort((a, b) => {
    const visibleA = a.visible_order ?? Number.MAX_SAFE_INTEGER;
    const visibleB = b.visible_order ?? Number.MAX_SAFE_INTEGER;
    if (visibleA !== visibleB) return visibleA - visibleB;

    const priorityA = a.capture_priority ?? 100;
    const priorityB = b.capture_priority ?? 100;
    if (priorityA !== priorityB) return priorityA - priorityB;

    const orderA = a.capture_order || Number.MAX_SAFE_INTEGER;
    const orderB = b.capture_order || Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
