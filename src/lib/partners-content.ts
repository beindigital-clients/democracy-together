import type { Locale } from '@/i18n/routing';

// F-14 — Partners & supporters. The hard-coded content (partnership categories
// in all five languages) lives in `convex/lib/contenus/coded/partners.ts`:
// it is what the internal import copies into `contentPartners` and what the
// page serves as a FALLBACK as long as the table is empty or the backend unreachable.
import {
  CODED_PARTNERS,
  PARTNER_SLUGS,
  type PartnerCategory,
  type PartnerSlug,
} from '@convex/lib/contenus/coded/partners';
export { PARTNER_SLUGS };
export type { PartnerCategory, PartnerSlug };

// Exhaustive table by construction (see `projects-content.ts`).
const BY_LOCALE: Record<
  Locale,
  Record<PartnerSlug, PartnerCategory>
> = CODED_PARTNERS;

export function getPartners(locale: Locale): PartnerCategory[] {
  const table = BY_LOCALE[locale];
  return PARTNER_SLUGS.map((s) => table[s]);
}

export function getPartner(
  locale: Locale,
  slug: string,
): PartnerCategory | null {
  const table = BY_LOCALE[locale];
  return (PARTNER_SLUGS as readonly string[]).includes(slug)
    ? table[slug as PartnerSlug]
    : null;
}
