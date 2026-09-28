'use client';

import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { PersonCard, type PersonCardData } from './person-card';

// « Mon réseau » : fil d'activité des personnes suivies, abonnements, abonnés,
// organisations suivies. Le fil ne contient que des contenus PUBLIÉS : le
// filtre est côté Convex (`social.follows.activityFeed`), pas ici.

const H2 = 'font-display text-2xl text-ink';

export function NetworkView({
  themeLabels,
}: {
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('people');
  const locale = useLocale();
  const feed = useQuery(api.social.follows.activityFeed);
  const network = useQuery(api.social.follows.myNetwork);
  const orgs = useQuery(api.social.follows.myFollowedOrganizations);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <div className="space-y-12">
      <section aria-labelledby="reseau-fil">
        <h2 id="reseau-fil" className={H2}>
          {t('network.feedTitle')}
        </h2>
        {feed === undefined ? (
          <p role="status" className="mt-4 text-ink-soft">
            {t('loading')}
          </p>
        ) : feed.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-line-strong bg-surface p-6 text-sm text-ink-soft">
            {t('network.feedEmpty')}
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
            {feed.map((item) => (
              <li key={`${item.kind}:${item.href}`} className="p-4">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  <span className="rounded-pill border border-line-strong px-2 py-0.5">
                    {item.kind === 'publication'
                      ? t('network.feedPublication')
                      : t('network.feedTribune')}
                  </span>
                  <time dateTime={new Date(item.at).toISOString()}>
                    {fmt(item.at)}
                  </time>
                </div>
                <Link
                  href={item.href}
                  className="mt-1.5 block wrap-anywhere font-display text-lg text-ink hover:text-accent-text hover:underline"
                >
                  {item.title}
                </Link>
                <Link
                  href={`/membres/${item.author.handle}`}
                  className="text-sm text-accent-text hover:underline"
                >
                  {t('network.by', { name: item.author.displayName })}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <PeopleList
        id="reseau-abonnements"
        title={t('network.followingTitle')}
        empty={t('network.emptyFollowing')}
        list={network?.following}
        themeLabels={themeLabels}
      />
      <PeopleList
        id="reseau-abonnes"
        title={t('network.followersTitle')}
        empty={t('network.emptyFollowers')}
        list={network?.followers}
        themeLabels={themeLabels}
      />

      <section aria-labelledby="reseau-orgs">
        <h2 id="reseau-orgs" className={H2}>
          {t('network.orgs')}
        </h2>
        {orgs === undefined ? null : orgs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">{t('network.orgsEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {orgs.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/le-reseau/${o.slug}`}
                  className="inline-flex min-h-11 items-center rounded-pill border border-line-strong px-4 text-sm text-ink hover:bg-surface-2"
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/membres"
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
      >
        {t('network.browse')}
      </Link>
    </div>
  );
}

function PeopleList({
  id,
  title,
  empty,
  list,
  themeLabels,
}: {
  id: string;
  title: string;
  empty: string;
  list: { items: PersonCardData[]; hidden: number } | undefined;
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('people');
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={H2}>
        {title}
      </h2>
      {list === undefined ? null : list.items.length === 0 &&
        list.hidden === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{empty}</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {list.items.map((p) => (
              <li key={p.handle}>
                <PersonCard person={p} themeLabels={themeLabels} />
              </li>
            ))}
          </ul>
          {list.hidden > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {t('network.hidden', { count: list.hidden })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
