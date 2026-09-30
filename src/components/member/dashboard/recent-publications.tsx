'use client';

import { useQuery } from 'convex/react';
import { FilePlus2, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PublicationsTable,
  type MyPublication,
} from '@/components/member/publications-table';
import { CardLink, DashCard } from './dash-card';

export const RECENT_PUBLICATIONS = 5;

export function RecentPublicationsView({
  items,
}: {
  items: readonly MyPublication[] | undefined;
}) {
  const t = useTranslations('member');
  const tl = useTranslations('library');
  const more = items !== undefined && items.length > RECENT_PUBLICATIONS;
  return (
    <DashCard
      titleId="dash-publications-title"
      title={t('publicationsTitle')}
      icon={FileText}
      action={
        items && items.length > 0 ? (
          <Button asChild variant="outline" size="sm" className="min-h-10">
            <Link href="/espace-membre/deposer">
              <FilePlus2 aria-hidden="true" />
              {t('publicationsNew')}
            </Link>
          </Button>
        ) : null
      }
    >
      {items === undefined ? (
        <div aria-hidden="true" className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-paper/40 px-5 py-8 text-center">
          <FileText
            aria-hidden="true"
            className="mx-auto h-8 w-8 text-line-strong"
          />
          <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-relaxed text-ink-soft">
            {tl('mine.empty')}
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/espace-membre/deposer">{tl('mine.emptyCta')}</Link>
          </Button>
        </div>
      ) : (
        <>
          <PublicationsTable
            caption={t('publicationsTitle')}
            items={items.slice(0, RECENT_PUBLICATIONS)}
          />
          <div className="mt-2">
            <CardLink href="/espace-membre/publications">
              {more
                ? t('publicationsSeeAllCount', { count: items.length })
                : t('publicationsSeeAll')}
            </CardLink>
          </div>
        </>
      )}
    </DashCard>
  );
}

export function RecentPublications() {
  const mine = useQuery(api.publications.listMine);
  return <RecentPublicationsView items={mine} />;
}
