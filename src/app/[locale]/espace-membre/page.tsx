'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery
} from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { isStaff, isMember } from '@/lib/roles';
import { formatLongDate } from '@/lib/publications';
const STATUS_BADGE: Record<string, string> = {
  published:
    'border-[color-mix(in_srgb,var(--color-bar-1)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-1)_9%,transparent)] text-bar-1',
  pending:
    'border-[color-mix(in_srgb,var(--color-bar-4)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-4)_10%,transparent)] text-bar-4',
  draft: 'border-line-strong bg-surface-2 text-muted'
};

// Tableau « Mes contributions » (F-32) — les dépôts du membre, tous statuts.
function MyContributions() {
  const t = useTranslations('library');
  const locale = useLocale();
  const mine = useQuery(api.publications.listMine);

  return (
    <section className="mt-10" aria-label={t('mine.title')}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">{t('mine.title')}</h2>
        <Button asChild size="sm">
          <Link href="/espace-membre/deposer">{t('mine.submitCta')}</Link>
        </Button>
      </div>

      {mine === undefined ? (
        <p className="mt-5 text-ink-soft">{t('mine.loading')}</p>
      ) : mine.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="text-ink-soft">{t('mine.empty')}</p>
          <Button asChild className="mt-4">
            <Link href="/espace-membre/deposer">{t('mine.emptyCta')}</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-md border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
                  {t('mine.colTitle')}
                </th>
                <th className="hidden px-4 py-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted sm:table-cell">
                  {t('mine.colType')}
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
                  {t('mine.colStatus')}
                </th>
                <th className="hidden px-4 py-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted md:table-cell">
                  {t('mine.colDate')}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {mine.map((p) => (
                <tr
                  key={p._id}
                  className="border-b border-line last:border-0 hover:bg-accent-tint/60"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{p.title}</span>
                    {p.status === 'draft' && p.reviewNotes ? (
                      <span className="mt-1 block max-w-[48ch] text-xs text-muted">
                        “{p.reviewNotes}”
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">
                    {t(`types.${p.type}`)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-pill border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] ${
                        STATUS_BADGE[p.status] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {t(`status.${p.status}`)}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-xs text-muted md:table-cell">
                    {formatLongDate(p.submittedAt, locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'published' ? (
                      <Link
                        href={`/bibliotheque/${p.slug}`}
                        className="text-[13px] font-medium text-accent-text hover:underline"
                      >
                        {t('mine.open')}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Visiteur (auto-inscrit, pas encore membre validé) : invitation à candidater.
function BecomeMember() {
  const t = useTranslations('auth');
  return (
    <section className="mt-10 rounded-md border border-accent-edge bg-accent-tint p-6">
      <h2 className="font-display text-xl text-ink">{t('becomeMemberTitle')}</h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
        {t('becomeMemberBody')}
      </p>
      <Button asChild className="mt-4">
        <Link href="/adhesion">{t('becomeMemberCta')}</Link>
      </Button>
    </section>
  );
}

function MemberDashboard() {
  const t = useTranslations('auth');
  const me = useQuery(api.users.current);
  const member = isMember(me?.role);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl">{t('memberTitle')}</h1>
      <p className="mt-2 text-ink-soft">
        {t('memberWelcome', { name: me?.name ?? me?.email ?? '' })}
      </p>

      <dl className="mt-8 divide-y divide-line rounded-md border border-line bg-surface">
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm text-ink-soft">{t('memberEmail')}</dt>
          <dd className="font-mono text-sm">{me?.email}</dd>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm text-ink-soft">{t('memberRole')}</dt>
          <dd className="text-sm">{me?.role}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {me && isStaff(me.role) ? (
          <Link
            href="/admin"
            className="inline-block text-sm font-medium text-accent-text hover:underline"
          >
            {t('adminLink')} →
          </Link>
        ) : null}
        <Link
          href="/espaces"
          className="inline-block text-sm font-medium text-accent-text hover:underline"
        >
          {t('workspacesLink')} →
        </Link>
      </div>

      {member ? <MyContributions /> : <BecomeMember />}
    </div>
  );
}

export default function EspaceMembrePage() {
  return (
    <AuthGate className="max-w-md"><MemberDashboard /></AuthGate>
  );
}
