'use client';

import { useMemo, useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextareaField } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LoadMore } from '@/components/admin/load-more';
import { AdminCercleList } from '@/components/cercle/admin-cercle-list';
import { AdminCercleMessages } from '@/components/cercle/admin-cercle-messages';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { intlLocale } from '@/i18n/locale';

type Request = FunctionReturnType<
  typeof api.cercle.listRequests
>['page'][number];
type Status = 'pending' | 'approved' | 'rejected';

const PAGE_SIZE = 25;

function RequestRow({ request }: { request: Request }) {
  const t = useTranslations('cercle');
  const locale = useLocale();
  const review = useMutation(api.cercle.reviewRequest);
  const openCv = useMutation(api.cercle.openCv);
  const retrySummary = useMutation(api.cercleCvAi.retrySummary);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState<'approved' | 'rejected' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(request.submittedAt),
    [locale, request.submittedAt],
  );

  async function decide(decision: 'approved' | 'rejected') {
    setBusy(true);
    try {
      await review({
        requestId: request._id,
        decision,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      notify(
        t(decision === 'approved' ? 'feedbackApproved' : 'feedbackRejected', {
          name: request.name,
        }),
      );
      setConfirming(null);
    } catch (err) {
      fail(err);
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  async function onRetrySummary() {
    try {
      await retrySummary({ requestId: request._id });
      notify(t('summaryRetried'));
    } catch {
      notify(t('summaryRetryErr'), 'error');
    }
  }

  async function viewCv() {
    try {
      const url = await openCv({ requestId: request._id });
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else notify(t('cvOpenFailed'), 'error');
    } catch (err) {
      fail(err);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-ink">{request.name}</h2>
          <p
            dir="ltr"
            className="break-all font-mono text-[13px] text-ink-soft"
          >
            {request.email}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t('submittedOn', { date })}
            {request.country ? ` · ${request.country}` : ''}
          </p>
        </div>
        <Badge variant={request.status === 'rejected' ? 'bad' : 'default'}>
          {request.status === 'pending'
            ? t('tabPending')
            : request.status === 'approved'
              ? t('tabApproved')
              : t('tabRejected')}
        </Badge>
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
        {t('motivationLabel')}
      </p>
      <p className="mt-1 whitespace-pre-line wrap-anywhere text-sm text-ink-soft">
        {request.motivation ?? t('noMotivation')}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {request.hasCv ? (
          <Button type="button" variant="outline" size="sm" onClick={viewCv}>
            {t('cvOpen', { name: request.name })}
          </Button>
        ) : (
          <span className="text-muted">
            {request.cvDeleted ? t('cvDeleted') : t('cvNone')}
          </span>
        )}
        <span className="text-xs text-muted">
          {t('versions', {
            charter: request.charterVersion,
            notice: request.noticeVersion,
          })}
        </span>
        {request.status === 'approved' && request.invited ? (
          <span className="text-xs text-muted">{t('invited')}</span>
        ) : null}
      </div>

      {request.cvAiState !== 'none' ? (
        <section
          aria-label={t('summaryTitle')}
          className="mt-4 rounded-md border border-line bg-surface-2 p-4 text-sm"
        >
          <p className="font-medium text-ink">{t('summaryTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('summaryNote')}</p>
          {request.cvSummary ? (
            <dl className="mt-3 space-y-2 text-ink-soft">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">
                  {t('summaryOverview')}
                </dt>
                <dd>{request.cvSummary.overview}</dd>
              </div>
              {(
                [
                  ['summaryEducation', request.cvSummary.education],
                  ['summaryExperience', request.cvSummary.experience],
                  ['summaryLanguages', request.cvSummary.languages],
                  ['summaryThemes', request.cvSummary.themes],
                ] as const
              ).map(([key, items]) =>
                items.length > 0 ? (
                  <div key={key}>
                    <dt className="text-xs uppercase tracking-wide text-muted">
                      {key === 'summaryEducation'
                        ? t('summaryEducation')
                        : key === 'summaryExperience'
                          ? t('summaryExperience')
                          : key === 'summaryLanguages'
                            ? t('summaryLanguages')
                            : t('summaryThemes')}
                    </dt>
                    <dd>{items.join(' · ')}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          ) : request.cvAiState === 'failed' ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-ink-soft">{t('summaryFailed')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetrySummary}
              >
                {t('summaryRetry')}
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-ink-soft">{t('summaryPending')}</p>
          )}
        </section>
      ) : null}

      {request.status === 'pending' ? (
        <div className="mt-4 space-y-3">
          <TextareaField
            label={t('notesLabel')}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => setConfirming('approved')}
            >
              {t('approve', { name: request.name })}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming('rejected')}
            >
              {t('reject', { name: request.name })}
            </Button>
          </div>
        </div>
      ) : request.reviewNotes ? (
        <p className="mt-3 text-sm text-ink-soft">{request.reviewNotes}</p>
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={t(confirming === 'rejected' ? 'rejectTitle' : 'approveTitle', {
          name: request.name,
        })}
        description={t(
          confirming === 'rejected' ? 'rejectBody' : 'approveBody',
        )}
        confirmLabel={t(
          confirming === 'rejected' ? 'confirmReject' : 'confirmApprove',
        )}
        cancelLabel={t('cancel')}
        destructive={confirming === 'rejected'}
        pending={busy}
        onConfirm={() => confirming && decide(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </li>
  );
}

function RequestsTab() {
  const t = useTranslations('cercle');
  const [status, setStatus] = useState<Status>('pending');
  const {
    results,
    status: loadStatus,
    loadMore,
  } = usePaginatedQuery(
    api.cercle.listRequests,
    { status },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div>
      <p className="max-w-[68ch] text-ink-soft">{t('adminIntro')}</p>

      <ToggleGroup
        type="single"
        size="sm"
        value={status}
        onValueChange={(v) => {
          if (v === 'pending' || v === 'approved' || v === 'rejected') {
            setStatus(v);
          }
        }}
        aria-label={t('tabRequests')}
        className="mt-5"
      >
        <ToggleGroupItem value="pending">{t('tabPending')}</ToggleGroupItem>
        <ToggleGroupItem value="approved">{t('tabApproved')}</ToggleGroupItem>
        <ToggleGroupItem value="rejected">{t('tabRejected')}</ToggleGroupItem>
      </ToggleGroup>

      {loadStatus === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">…</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('empty')}</p>
      ) : (
        <ul aria-label={t('tabRequests')} className="mt-6 space-y-3">
          {results.map((r) => (
            <RequestRow key={r._id} request={r} />
          ))}
        </ul>
      )}

      <LoadMore status={loadStatus} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

type Tab = 'requests' | 'list' | 'messages';

export default function AdminCerclePage() {
  const t = useTranslations('cercle');
  const [tab, setTab] = useState<Tab>('requests');

  return (
    <div>
      <h1 className="font-display text-3xl">{t('adminTitle')}</h1>

      <ToggleGroup
        type="single"
        size="sm"
        value={tab}
        onValueChange={(v) => {
          if (v === 'requests' || v === 'list' || v === 'messages') setTab(v);
        }}
        aria-label={t('adminTitle')}
        className="mt-5"
      >
        <ToggleGroupItem value="requests">{t('tabRequests')}</ToggleGroupItem>
        <ToggleGroupItem value="list">{t('tabList')}</ToggleGroupItem>
        <ToggleGroupItem value="messages">{t('tabMessages')}</ToggleGroupItem>
      </ToggleGroup>

      <div className="mt-6">
        {tab === 'requests' ? (
          <RequestsTab />
        ) : tab === 'list' ? (
          <AdminCercleList />
        ) : (
          <AdminCercleMessages />
        )}
      </div>
    </div>
  );
}
