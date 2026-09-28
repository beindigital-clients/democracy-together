import { SITE_URL } from '@/lib/seo';

// Fiche `Person` (schema.org) d'un profil PUBLIC `/membres/<handle>`.
//
// Même principe que `organizationJsonLd` : on ne déclare que ce que la page
// montre. Pas d'adresse, pas d'e-mail, pas de date de naissance — la page
// n'en a pas. La photo n'est PAS déclarée non plus : son URL est signée par le
// stockage et n'a pas vocation à être reprise par un moteur comme image
// canonique de la personne.
//
// N'est posée que sur un profil INDEXABLE (visibilité publique) : un profil
// réservé aux membres ne se décrit pas aux moteurs.
export function personJsonLd(input: {
  locale: string;
  handle: string;
  displayName: string;
  jobTitle: string | null;
  description: string | null;
  organization: { name: string; slug: string } | null;
  sameAs: string[];
}) {
  const url = `${SITE_URL}/${input.locale}/membres/${input.handle}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': url,
    url,
    name: input.displayName,
    ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.organization
      ? {
          worksFor: {
            '@type': 'Organization',
            name: input.organization.name,
            url: `${SITE_URL}/${input.locale}/le-reseau/${input.organization.slug}`,
          },
        }
      : {}),
    ...(input.sameAs.length > 0 ? { sameAs: input.sameAs } : {}),
  };
}

// Description de partage : la fonction, puis le début de la biographie.
export function profileDescription(p: {
  jobTitle: string | null;
  bio: string | null;
}): string | undefined {
  const parts = [p.jobTitle, p.bio].filter(Boolean).join(' — ');
  if (!parts) return undefined;
  return parts.length > 200 ? `${parts.slice(0, 199)}…` : parts;
}
