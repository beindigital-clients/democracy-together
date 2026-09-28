'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { countryFlag, countryName } from '@/lib/orgs';
import { PersonAvatar } from './person-avatar';

export type PersonCardData = {
  handle: string;
  displayName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  country: string | null;
  themes: string[];
  languages: string[];
  followerCount: number;
};

// Person card (directory, followers, following). The whole card is a
// link — a single full-width touch target — to `/membres/<handle>`.
export function PersonCard({
  person,
  themeLabels,
}: {
  person: PersonCardData;
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('people');
  const locale = useLocale();
  return (
    <Link
      href={`/membres/${person.handle}`}
      className="flex h-full min-h-11 items-start gap-3 rounded-md border border-line bg-surface p-4 transition-colors hover:border-accent-edge hover:bg-accent-tint/40"
    >
      <PersonAvatar
        name={person.displayName}
        photoUrl={person.photoUrl}
        size={52}
      />
      <span className="min-w-0 flex-1">
        <span className="block wrap-anywhere font-display text-lg leading-tight text-ink">
          {person.displayName}
        </span>
        {person.jobTitle ? (
          <span className="mt-0.5 block wrap-anywhere text-sm text-ink-soft">
            {person.jobTitle}
          </span>
        ) : null}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {person.country ? (
            <span>
              <span aria-hidden="true">{countryFlag(person.country)}</span>{' '}
              {countryName(person.country, locale)}
            </span>
          ) : null}
          <span>{t('followers', { count: person.followerCount })}</span>
        </span>
        {person.themes.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-1">
            {person.themes.slice(0, 3).map((slug) => (
              <span
                key={slug}
                className="rounded-pill border border-line-strong px-2 py-0.5 text-[11px] text-ink-soft"
              >
                {themeLabels[slug] ?? slug}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
