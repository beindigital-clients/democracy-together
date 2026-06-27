'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

export default function AdminDashboard() {
  const t = useTranslations('admin');
  const stats = useQuery(api.admin.dashboardStats);

  const cards = [
    { key: 'statPending', value: stats?.pendingApplications, accent: true },
    { key: 'statPubPending', value: stats?.pendingPublications, accent: true },
    { key: 'statMembers', value: stats?.activeMembers, accent: false },
    { key: 'statUsers', value: stats?.totalUsers, accent: false },
    { key: 'statContacts', value: stats?.unhandledContacts, accent: false },
  ] as const;

  return (
    <div>
      <h1 className="font-display text-3xl">{t('dashboard')}</h1>

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

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/admin/candidatures"
          className="inline-block text-sm text-accent-text hover:underline"
        >
          {t('quickApplications')} →
        </Link>
        <Link
          href="/admin/publications"
          className="inline-block text-sm text-accent-text hover:underline"
        >
          {t('quickPublications')} →
        </Link>
      </div>
    </div>
  );
}
