'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { FilePlus2, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember } from '@/lib/roles';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
import { PublicationsTable } from '@/components/member/publications-table';

// MES PUBLICATIONS (F-32) — every library submission of the member, all
// statuses, with a filter by status. The dashboard shows the latest five and
// leads here for the rest: the old member area listed them all on its home
// page, which grew with every submission.

const STATUSES = ['pending', 'published', 'draft'] as const;
type Filter = 'all' | (typeof STATUSES)[number];

function Publications() {
  const t = useTranslations('member');
  const tl = useTranslations('library');
  const me = useQuery(api.users.current);
  const member = isMember(me?.role);
  const mine = useQuery(api.publications.listMine, member ? {} : 'skip');
  const [filter, setFilter] = useState<Filter>('all');

  if (me === undefined) return <AuthGateLoading />;

  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, mine?.filter((p) => p.status === s).length ?? 0]),
  ) as Record<(typeof STATUSES)[number], number>;
  const shown =
    mine === undefined
      ? undefined
      : filter === 'all'
        ? mine
        : mine.filter((p) => p.status === filter);

  return (
    <>
      <MemberPageHeader
        title={t('publicationsTitle')}
        lead={t('publicationsPageLead')}
        actions={
          member ? (
            <Button asChild className="min-h-11">
              <Link href="/espace-membre/deposer">
                <FilePlus2 aria-hidden="true" />
                {t('publicationsNew')}
              </Link>
            </Button>
          ) : null
        }
      />
      <MemberPageBody>
        {!member ? (
          <div className="rounded-md border border-accent-edge bg-accent-tint p-6">
            <p className="max-w-[60ch] leading-relaxed text-ink-soft">
              {t('publicationsMembersOnly')}
            </p>
            <Button asChild className="mt-4 min-h-11">
              <Link href="/adhesion">{tl('submit.becomeMemberCta')}</Link>
            </Button>
          </div>
        ) : shown === undefined ? (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-40 w-full rounded-md" />
          </div>
        ) : mine && mine.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <FileText
              aria-hidden="true"
              className="mx-auto h-9 w-9 text-line-strong"
            />
            <p className="mx-auto mt-3 max-w-[44ch] text-ink-soft">
              {tl('mine.empty')}
            </p>
            <Button asChild className="mt-5 min-h-11">
              <Link href="/espace-membre/deposer">{tl('mine.emptyCta')}</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Status filter: one choice among the statuses (a radio
                group), the count of each in its label. */}
            <ToggleGroup
              type="single"
              variant="outline"
              value={filter}
              onValueChange={(v) => {
                if (v === 'all' || STATUSES.some((s) => s === v)) {
                  setFilter(v as Filter);
                }
              }}
              aria-label={t('publicationsFilterLabel')}
            >
              {(['all', ...STATUSES] as const).map((f) => {
                const count = f === 'all' ? (mine?.length ?? 0) : counts[f];
                return (
                  <ToggleGroupItem
                    key={f}
                    value={f}
                    className="min-h-10 rounded-pill px-3.5"
                  >
                    {f === 'all'
                      ? t('publicationsFilterAll')
                      : vocabulary(tl, 'status.', f)}
                    <span className="font-mono text-xs font-normal tabular-nums text-muted">
                      {count}
                    </span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
            <p role="status" className="mt-4 text-sm text-muted">
              {t('publicationsCount', { count: shown.length })}
            </p>
            <div className="mt-3">
              {shown.length === 0 ? (
                <p className="rounded-md border border-dashed border-line-strong bg-surface p-6 text-sm text-ink-soft">
                  {t('publicationsNoneForFilter')}
                </p>
              ) : (
                <PublicationsTable
                  caption={t('publicationsTitle')}
                  items={shown}
                />
              )}
            </div>
          </>
        )}
      </MemberPageBody>
    </>
  );
}

export default function MyPublicationsPage() {
  return (
    <AuthGate>
      <Publications />
    </AuthGate>
  );
}
