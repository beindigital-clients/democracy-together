'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';

// Mesure d'impact & statistiques (F-66) — back-office. Grille de cartes
// (chiffre + libellé), même style que le tableau de bord (admin/page.tsx).
export default function AdminImpact() {
  const t = useTranslations('admin');
  const stats = useQuery(api.impact.impactStats);

  const cards = [
    {
      key: 'impPublications',
      value: stats?.publishedPublications,
      accent: true,
    },
    {
      key: 'impOrganizations',
      value: stats?.activeOrganizations,
      accent: false,
    },
    {
      key: 'impEventRegistrations',
      value: stats?.eventRegistrations,
      accent: false,
    },
    {
      key: 'impNewsletter',
      value: stats?.newsletterSubscribers,
      accent: false,
    },
    { key: 'impTribunePosts', value: stats?.tribunePosts, accent: false },
    { key: 'impTribuneComments', value: stats?.tribuneComments, accent: false },
    { key: 'impYouth', value: stats?.youthApplications, accent: false },
    {
      key: 'impYouthPending',
      value: stats?.youthApplicationsPending,
      accent: true,
    },
    {
      key: 'impMembership',
      value: stats?.membershipApplications,
      accent: false,
    },
    {
      key: 'impMembershipPending',
      value: stats?.membershipApplicationsPending,
      accent: true,
    },
  ] as const;

  return (
    <div>
      <h1 className="font-display text-3xl">{t('impTitle')}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t('impIntro')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`rounded-md border p-5 ${
              c.accent
                ? 'border-accent-edge bg-accent-tint'
                : 'border-line bg-surface'
            }`}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {t(c.key)}
            </p>
            <p
              className={`mt-2 font-display text-3xl ${
                c.accent ? 'text-accent-text' : 'text-ink'
              }`}
            >
              {c.value ?? '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
