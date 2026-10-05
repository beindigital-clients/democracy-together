'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { KOHOP_BOUNDS } from '@convex/lib/kohop';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { MarkdownEditor } from './markdown-editor';
import { ReasonDialog } from './reason-dialog';
import { TextDiff, diffStats } from './text-diff';
import { useKohopDates, useKohopError } from './use-kohop';

type Dossier = NonNullable<FunctionReturnType<typeof api.kohopChief.dossier>>;

// PRODUCTION AND PUBLICATION, review chief's side (K-18/K-19): copy-editing
// with the changes shown against the accepted text, the proof, then publication
// — now or at a date, cancellable — and the retraction. Every button reflects
// what the server allows; the server decides.
export function ProductionPanel({ file }: { file: Dossier }) {
  const t = useTranslations('kohop');
  const locale = useLocale();
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const notify = useActionFeedback();
  const state = useQuery(api.kohopProduction.state, {
    contributionId: file._id,
  });
  const save = useMutation(api.kohopProduction.saveCopyedit);
  const sendProof = useMutation(api.kohopProduction.sendProof);
  const markReady = useMutation(api.kohopProduction.markReady);
  const publish = useMutation(api.kohopProduction.publish);
  const schedule = useMutation(api.kohopProduction.schedule);
  const unschedule = useMutation(api.kohopProduction.unschedule);
  const retract = useMutation(api.kohopProduction.retract);

  const current = file.versions.find(
    (v) => v.version === (file.acceptedVersion ?? file.currentVersion),
  );
  const original = file.versions.find(
    (v) => v.version === state?.acceptedOriginalVersion,
  );
  const [title, setTitle] = useState(current?.title ?? file.title);
  const [standfirst, setStandfirst] = useState(current?.standfirst ?? '');
  const [body, setBody] = useState(current?.body ?? '');
  const [dirty, setDirty] = useState(false);
  const [when, setWhen] = useState('');
  const [dialog, setDialog] = useState<'publish' | 'retract' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stats = useMemo(
    () => (original ? diffStats(original.body, body) : null),
    [original, body],
  );
  const B = KOHOP_BOUNDS;
  const stage = file.stage;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      setDialog(null);
      notify(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const persist = () =>
    save({
      contributionId: file._id,
      title,
      standfirst,
      body,
      links: (current?.links ?? []).map((l) =>
        l.publicationId
          ? { label: l.label, publicationId: l.publicationId }
          : { label: l.label, url: l.url },
      ),
    });

  return (
    <section
      aria-labelledby="kohop-production"
      className="mt-6 rounded-md border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="kohop-production" className="font-display text-xl text-ink">
        {t('productionTitle')}
      </h2>

      {stage === 'production' ? (
        <div className="mt-3 space-y-5">
          <p className="max-w-[68ch] text-sm text-ink-soft">
            {t('copyeditLead')}
          </p>
          <MarkdownEditor
            label={t('bodyLabel')}
            hint={t('bodyHint')}
            value={body}
            lang={file.lang}
            min={B.words.min}
            max={B.words.max}
            onChange={(next) => {
              setBody(next);
              setDirty(true);
            }}
          />
          <TextField
            label={t('titleLabel')}
            value={title}
            maxLength={B.title.max}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
          <TextareaField
            label={t('standfirstLabel')}
            rows={3}
            maxLength={B.standfirst.max}
            value={standfirst}
            onChange={(e) => {
              setStandfirst(e.target.value);
              setDirty(true);
            }}
          />
          {original && stats ? (
            <div className="rounded-md border border-line bg-surface-2 p-4">
              <p className="text-sm text-ink" role="status">
                {stats.added === 0 && stats.removed === 0
                  ? t('noChanges')
                  : t('changesSummary', {
                      added: stats.added,
                      removed: stats.removed,
                    })}
              </p>
              {stats.added + stats.removed > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-accent-text">
                    {t('showChanges')}
                  </summary>
                  <div className="mt-3 rounded-md border border-line bg-surface p-4">
                    <TextDiff
                      before={original.body}
                      after={body}
                      lang={file.lang}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !dirty}
              onClick={() =>
                void run(async () => {
                  await persist();
                  setDirty(false);
                }, t('copyeditSaved'))
              }
            >
              {t('saveCopyedit')}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (dirty) {
                    await persist();
                    setDirty(false);
                  }
                  await sendProof({ contributionId: file._id });
                }, t('proofSentDone'))
              }
            >
              {t('sendProofButton')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                busy ||
                dirty ||
                state === undefined ||
                state?.changedSinceAcceptance === true
              }
              onClick={() =>
                void run(
                  () => markReady({ contributionId: file._id }),
                  t('readyDone'),
                )
              }
            >
              {t('markReadyButton')}
            </Button>
          </div>
          {state?.changedSinceAcceptance || dirty ? (
            <p className="text-sm text-muted">{t('proofRequiredHint')}</p>
          ) : null}
        </div>
      ) : null}

      {stage === 'proof' ? (
        <p className="mt-3 text-sm text-ink-soft">
          {file.proofDueAt
            ? t('proofSentUntil', { date: dates.day(file.proofDueAt) })
            : t('proofWaiting')}
        </p>
      ) : null}

      {stage === 'ready' ? (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              disabled={busy || state?.gateOk !== true}
              onClick={() => setDialog('publish')}
            >
              {t('publishNow')}
            </Button>
            <TextField
              label={t('scheduleLabel')}
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || state?.gateOk !== true || !when}
              onClick={() =>
                void run(
                  () =>
                    schedule({
                      contributionId: file._id,
                      at: new Date(when).getTime(),
                    }),
                  t('scheduledDone'),
                )
              }
            >
              {t('scheduleButton')}
            </Button>
          </div>
          {state?.gateOk !== true ? (
            <p className="text-sm text-muted">
              {t('originalityPublishBlocked')}
            </p>
          ) : null}
        </div>
      ) : null}

      {stage === 'scheduled' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink">
            {file.scheduledFor
              ? t('scheduledFor', {
                  date: `${dates.day(file.scheduledFor)} ${dates.time(file.scheduledFor)}`,
                })
              : ''}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => unschedule({ contributionId: file._id }),
                t('unscheduledDone'),
              )
            }
          >
            {t('unscheduleButton')}
          </Button>
        </div>
      ) : null}

      {stage === 'published' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {file.slug ? (
            <Link
              href={`/kohop/${file.slug}`}
              locale={locale}
              className="font-medium text-accent-text hover:underline"
            >
              {t('publicPage')}
            </Link>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setDialog('retract')}
          >
            {t('retractButton')}
          </Button>
        </div>
      ) : null}

      <FormError className="mt-3">{dialog ? '' : error}</FormError>

      <ConfirmDialog
        open={dialog === 'publish'}
        title={t('publishConfirmTitle', { title: file.title })}
        description={t('publishConfirmBody')}
        confirmLabel={t('publishConfirm')}
        cancelLabel={t('cancel')}
        pending={busy}
        onConfirm={() =>
          void run(
            () => publish({ contributionId: file._id }),
            t('publishedDone'),
          )
        }
        onCancel={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'retract'}
        title={t('retractTitle', { title: file.title })}
        description={t('retractBody')}
        confirmLabel={t('retractConfirm')}
        reasonLabel={t('retractReasonLabel')}
        reasonHint={t('reasonHint', { min: B.reason.min })}
        minLength={B.reason.min}
        second={{
          label: t('retractNoticeLabel'),
          hint: t('retractNoticeHint'),
          minLength: B.reason.min,
        }}
        pending={busy}
        error={error}
        onConfirm={(reason, _code, notice) =>
          void run(
            () => retract({ contributionId: file._id, reason, notice }),
            t('retractedDone'),
          )
        }
        onCancel={() => setDialog(null)}
      />
    </section>
  );
}
