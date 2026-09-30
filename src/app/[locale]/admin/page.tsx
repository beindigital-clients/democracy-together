'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';
import { TwoFactorPolicyWarning } from '@/components/admin/two-factor-policy';

export default function AdminDashboard() {
  const t = useTranslations('admin');
  const stats = useQuery(api.admin.dashboardStats);

  // A counter of work WAITING opens its queue: the number is what catches
  // the eye, it was the one thing on the screen that led nowhere.
  const cards = [
    {
      key: 'statPending',
      value: stats?.pendingApplications,
      href: '/admin/candidatures',
    },
    {
      key: 'statPubPending',
      value: stats?.pendingPublications,
      href: '/admin/publications',
    },
    { key: 'statMembers', value: stats?.activeMembers, href: null },
    { key: 'statUsers', value: stats?.totalUsers, href: null },
    {
      key: 'statContacts',
      value: stats?.unhandledContacts,
      href: '/admin/contact',
    },
  ] as const;

  return (
    <div>
      <h1 className="font-display text-3xl">{t('dashboard')}</h1>
      {/* Accounts workstream: as long as 2FA is not mandatory for
          staff, the administrator sees it on every visit. */}
      <TwoFactorPolicyWarning />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          // Highlighted only when something actually waits: an accent on an
          // empty queue calls for an action there is no need to take.
          const waiting = c.href !== null && (c.value ?? 0) > 0;
          const body = (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {t(c.key)}
              </p>
              <p
                className={`mt-2 font-display text-3xl ${
                  waiting ? 'text-accent-text' : 'text-ink'
                }`}
              >
                {c.value ?? '—'}
              </p>
            </>
          );
          const frame = `rounded-md border p-5 ${
            waiting
              ? 'border-accent-edge bg-accent-tint'
              : 'border-line bg-surface'
          }`;
          return c.href ? (
            <Link
              key={c.key}
              href={c.href}
              className={`${frame} block transition-colors hover:border-accent-edge focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text`}
            >
              {body}
            </Link>
          ) : (
            <div key={c.key} className={frame}>
              {body}
            </div>
          );
        })}
      </div>

      {/* `py-1` on the links: 20 px finger target, measured on 27/09 (C-3). */}
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/admin/candidatures"
          className="inline-block py-1 text-sm text-accent-text hover:underline"
        >
          {t('quickApplications')} <ArrowForward />
        </Link>
        <Link
          href="/admin/publications"
          className="inline-block py-1 text-sm text-accent-text hover:underline"
        >
          {t('quickPublications')} <ArrowForward />
        </Link>
      </div>
    </div>
  );
}
