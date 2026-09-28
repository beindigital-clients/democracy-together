import { SITE_URL } from '@/lib/seo';

// `Person` entry (schema.org) for a PUBLIC `/membres/<handle>` profile.
//
// Same principle as `organizationJsonLd`: we only declare what the page
// shows. No address, no email, no date of birth — the page has none. The
// photo is NOT declared either: its URL is signed by the storage and is not
// meant to be picked up by a search engine as the person's canonical
// image.
//
// Only set on an INDEXABLE profile (public visibility): a members-only
// profile is not described to search engines.
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

// Sharing description: the job title, then the start of the biography.
export function profileDescription(p: {
  jobTitle: string | null;
  bio: string | null;
}): string | undefined {
  const parts = [p.jobTitle, p.bio].filter(Boolean).join(' — ');
  if (!parts) return undefined;
  return parts.length > 200 ? `${parts.slice(0, 199)}…` : parts;
}
