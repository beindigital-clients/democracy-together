'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isReviewChief } from '@/lib/roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// À TRAITER — the team's entry to the texts members send, circuit by circuit:
// the library (PDF documents), the Tribune (posts and comments), the KOHOP
// Review (manuscripts, review chiefs only). Each card gives the number
// waiting and opens that circuit's own queue, where the work happens.

// KOHOP stages that wait for a review chief's action.
const KOHOP_CHIEF_STAGES = ['submitted', 'decision', 'production', 'ready'];

type Card = {
  id: string;
  title: string;
  body: string;
  href: string;
  waiting: number | undefined;
};

export default function AdminToProcess() {
  const t = useTranslations('admin');
  const me = useQuery(api.users.current);
  const chief = isReviewChief(me ?? {});
  const stats = useQuery(api.admin.dashboardStats, {});
  const tribune = useQuery(api.communityModeration.queueCounts, {});
  const kohop = useQuery(
    api.kohopChief.queue,
    chief ? { stage: 'submitted' } : 'skip',
  );

  const cards: Card[] = [
    {
      id: 'library',
      title: t('toProcessLibrary'),
      body: t('toProcessLibraryBody'),
      href: '/admin/publications',
      waiting: stats?.pendingPublications,
    },
    {
      id: 'tribune',
      title: t('toProcessTribune'),
      body: t('toProcessTribuneBody'),
      href: '/admin/file-moderation',
      waiting: tribune?.pending,
    },
  ];
  if (chief) {
    cards.push({
      id: 'kohop',
      title: t('toProcessKohop'),
      body: t('toProcessKohopBody'),
      href: '/admin/kohop',
      waiting: kohop
        ? KOHOP_CHIEF_STAGES.reduce((n, s) => n + (kohop.counts[s] ?? 0), 0)
        : undefined,
    });
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{t('toProcess')}</h1>
      <p className="mt-2 max-w-[68ch] text-ink-soft">{t('toProcessLead')}</p>
      <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2
                id={`to-process-${c.id}`}
                className="font-display text-xl text-ink"
              >
                {c.title}
              </h2>
              <Badge
                variant={c.waiting ? 'pending' : 'default'}
                size="lg"
                aria-live="polite"
              >
                {c.waiting === undefined
                  ? t('toProcessLoading')
                  : t('toProcessWaiting', { count: c.waiting })}
              </Badge>
            </div>
            <p className="text-ink-soft">{c.body}</p>
            <Button asChild className="mt-auto min-h-11 self-start">
              <Link href={c.href} aria-describedby={`to-process-${c.id}`}>
                {t('toProcessOpen')}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
