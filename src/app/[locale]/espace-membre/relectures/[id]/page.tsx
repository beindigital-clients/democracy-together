'use client';

import { useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { AuthGateLoading } from '@/components/auth/auth-gate';
import { MemberPageHeader } from '@/components/member/page-header';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { InvitationReply } from '@/components/kohop/invitation-reply';
import { KohopText } from '@/components/kohop/kohop-text';
import { ReviewForm } from '@/components/kohop/review-form';
import { useKohopDates } from '@/components/kohop/use-kohop';
import { Badge } from '@/components/ui/badge';

export default function KohopReviewAssignment() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const params = useParams<{ id: string }>();
  const reviewerId = params.id as Id<'kohopReviewers'>;
  const a = useQuery(api.kohopReviews.assignment, { reviewerId });

  const back = (
    <p className="mt-6">
      <Link
        href="/espace-membre/relectures"
        className="inline-block py-1 font-medium text-accent-text hover:underline"
      >
        {t('backToReviews')}
      </Link>
    </p>
  );

  if (a === undefined) return <AuthGateLoading />;
  if (a === null) {
    return (
      <div className="max-w-3xl">
        <MemberPageHeader
          title={t('reviewNotFoundTitle')}
          lead={t('reviewNotFoundBody')}
        />
        {back}
      </div>
    );
  }

  const c = a.contribution;
  const by = c.authorName
    ? c.organization
      ? t('reviewAuthorOrg', {
          author: c.authorName,
          organization: c.organization,
        })
      : t('reviewAuthor', { author: c.authorName })
    : '';
  const status = a.reviewer.status;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <MemberPageHeader title={c.title} lead={by} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Badge
            variant={
              status === 'submitted'
                ? 'good'
                : status === 'invited'
                  ? 'pending'
                  : 'default'
            }
            size="label"
          >
            {vocabulary(t, 'reviewerStatus_', status)}
          </Badge>
          <span>{t('words', { count: c.words })}</span>
          {a.reviewer.dueAt ? (
            <span>
              {status === 'invited'
                ? t('replyBy', { date: dates.day(a.reviewer.dueAt) })
                : t('analysisBy', { date: dates.day(a.reviewer.dueAt) })}
            </span>
          ) : null}
        </div>
        {c.standfirst ? (
          <p className="mt-4 max-w-[62ch] text-ink-soft">{c.standfirst}</p>
        ) : null}
      </div>

      {status === 'invited' ? (
        <InvitationReply reviewerId={reviewerId} />
      ) : null}

      {status === 'declined' ? (
        <p className="rounded-md border border-line bg-surface p-5 text-ink-soft">
          {t('declinedDone')}
        </p>
      ) : null}
      {status === 'expired' ? (
        <p className="rounded-md border border-line bg-surface p-5 text-ink-soft">
          {t('expiredDone')}
        </p>
      ) : null}

      {a.body !== null ? (
        <section aria-labelledby="kohop-reading">
          <h2 id="kohop-reading" className="font-display text-2xl text-ink">
            {t('readingTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {t('readingConfidential')}
          </p>
          <div className="mt-4 rounded-md border border-line bg-surface p-5 sm:p-6">
            <KohopText markdown={a.body} lang={c.lang} />
          </div>
          {a.links.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-ink">
                {t('readingSources')}
              </h3>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                {a.links.map((l, i) => (
                  <li key={i} className="wrap-anywhere">
                    {l.url ? (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow ugc"
                        className="text-accent-text underline underline-offset-2 hover:no-underline"
                      >
                        {l.label}
                      </a>
                    ) : (
                      l.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {status === 'accepted' || status === 'submitted' ? (
        <ReviewForm
          reviewerId={reviewerId}
          initial={
            a.review
              ? {
                  recommendation: a.review.recommendation,
                  analysis: a.review.analysis,
                  noteToEditor: a.review.noteToEditor,
                }
              : null
          }
          editable={status === 'accepted' || a.review?.editable === true}
        />
      ) : null}
      {back}
    </div>
  );
}
