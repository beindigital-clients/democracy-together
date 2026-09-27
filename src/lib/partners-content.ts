import type { Locale } from '@/i18n/routing';

// F-14 — Partenaires & soutiens. Le contenu codé (catégories de partenariat
// dans les cinq langues) vit dans `convex/lib/contenus/coded/partners.ts` :
// c'est ce que l'import interne recopie dans `contentPartners` et ce que la
// page sert en REPLI tant que la table est vide ou le backend injoignable.
import {
  CODED_PARTNERS,
  PARTNER_SLUGS,
  type PartnerCategory,
  type PartnerSlug,
} from '@convex/lib/contenus/coded/partners';
export { PARTNER_SLUGS };
export type { PartnerCategory, PartnerSlug };

// Table exhaustive par construction (cf. `projects-content.ts`).
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
