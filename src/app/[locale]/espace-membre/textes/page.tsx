'use client';

import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { formatLongDate } from '@/lib/publications';
import { isMember } from '@/lib/roles';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_BADGE as TRIBUNE_BADGE } from '@/components/tribune/my-posts';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';

// MES TEXTES — every text the member has sent, whatever the circuit (library
// document, Tribune post, KOHOP manuscript), in one list with its stage in
// plain words. It reads the three existing "mine" queries: no new server
// code, and each row leads to the circuit's own screen for the detail.

type Circuit = 'library' | 'tribune' | 'kohop';

type Row = {
  key: string;
  circuit: Circuit;
  title: string;
  status: string;
  variant: BadgeVariant;
  at: number;
  started: boolean;
  href: string;
};

const LIBRARY_BADGE: Record<string, BadgeVariant> = {
  published: 'accent',
  pending: 'pending',
  draft: 'default',
};

// KOHOP: published reads as done, the final refusals as stopped, a draft as
// not sent yet; every other stage is work in progress.
function kohopBadge(stage: string): BadgeVariant {
  if (stage === 'published') return 'accent';
  if (stage === 'refused' || stage === 'retracted') return 'bad';
  if (stage === 'draft' || stage === 'withdrawn') return 'default';
  return 'pending';
}

function MyTexts() {
  const t = useTranslations('member');
  const tl = useTranslations('library');
  const tt = useTranslations('tribune');
  const tk = useTranslations('kohop');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  const member = isMember(me?.role);
  const library = useQuery(api.publications.listMine, member ? {} : 'skip');
  const tribune = useQuery(api.tribune.myPosts, member ? {} : 'skip');
  const kohop = useQuery(api.kohop.listMine, member ? {} : 'skip');

  if (me === undefined) return <AuthGateLoading />;

  const circuitLabel: Record<Circuit, string> = {
    library: t('myTextsCircuitLibrary'),
    tribune: t('myTextsCircuitTribune'),
    kohop: t('myTextsCircuitKohop'),
  };

  const loading =
    member &&
    (library === undefined || tribune === undefined || kohop === undefined);

  const rows: Row[] = loading
    ? []
    : [
        ...(library ?? []).map((p) => ({
          key: `library-${p._id}`,
          circuit: 'library' as const,
          title: p.title,
          status: vocabulary(tl, 'status.', p.status),
          variant: LIBRARY_BADGE[p.status] ?? 'default',
          at: p.submittedAt,
          started: false,
          href:
            p.status === 'published'
              ? `/bibliotheque/${p.slug}`
              : '/espace-membre/publications',
        })),
        ...(tribune ?? []).map((p) => ({
          key: `tribune-${p._id}`,
          circuit: 'tribune' as const,
          title: p.title,
          status: vocabulary(tt, 'status_', p.status),
          variant: TRIBUNE_BADGE[p.status],
          at: p.createdAt,
          started: false,
          href:
            p.status === 'published'
              ? `/tribune/${p._id}`
              : `/espace-membre/contributions/${p._id}`,
        })),
        ...(kohop ?? []).map((c) => ({
          key: `kohop-${c._id}`,
          circuit: 'kohop' as const,
          title: c.title,
          status: vocabulary(tk, 'stage_', c.stage),
          variant: kohopBadge(c.stage),
          at: c.submittedAt ?? c.updatedAt,
          started: c.submittedAt === null,
          href: `/espace-membre/kohop/${c._id}`,
        })),
      ].sort((a, b) => b.at - a.at);

  return (
    <>
      <MemberPageHeader
        title={t('myTextsTitle')}
        lead={t('myTextsLead')}
        actions={
          member ? (
            <Button asChild className="min-h-11">
              <Link href="/espace-membre/publier">{t('navPublish')}</Link>
            </Button>
          ) : null
        }
      />
      <MemberPageBody>
        {!member ? (
          <div className="rounded-md border border-accent-edge bg-accent-tint p-6">
            <p className="max-w-[60ch] leading-relaxed text-ink-soft">
              {t('publishMembersOnly')}
            </p>
            <Button asChild className="mt-4 min-h-11">
              <Link href="/adhesion">{tl('submit.becomeMemberCta')}</Link>
            </Button>
          </div>
        ) : loading ? (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="mx-auto max-w-[44ch] text-[17px] text-ink-soft">
              {t('myTextsEmpty')}
            </p>
            <Button asChild className="mt-5 min-h-11">
              <Link href="/espace-membre/publier">{t('myTextsEmptyCta')}</Link>
            </Button>
          </div>
        ) : (
          <>
            <p role="status" className="text-sm text-muted">
              {t('myTextsCount', { count: rows.length })}
            </p>
            <ul
              aria-label={t('myTextsListLabel')}
              className="mt-3 divide-y divide-line rounded-md border border-line bg-surface"
            >
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      {circuitLabel[r.circuit]}
                    </span>
                    <Link
                      href={r.href}
                      className="mt-1 block wrap-anywhere text-[17px] font-medium text-ink hover:underline"
                    >
                      {r.title || t('myTextsUntitled')}
                    </Link>
                    <span className="mt-1 block text-sm text-ink-soft">
                      {r.started
                        ? t('myTextsStartedOn', {
                            date: formatLongDate(r.at, locale),
                          })
                        : t('myTextsSentOn', {
                            date: formatLongDate(r.at, locale),
                          })}
                    </span>
                  </div>
                  <Badge variant={r.variant} size="lg" className="shrink-0">
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </MemberPageBody>
    </>
  );
}

export default function MyTextsPage() {
  return (
    <AuthGate>
      <MyTexts />
    </AuthGate>
  );
}
