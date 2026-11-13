'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextField, TextareaField, Field } from '@/components/ui/field';
import { useActionFeedback } from '@/components/admin/action-feedback';

type Report = FunctionReturnType<typeof api.cercleMailing.importContacts>;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <dd className="font-display text-2xl text-ink">{value}</dd>
      <dt className="mt-1 text-xs text-muted">{label}</dt>
    </div>
  );
}

// The Cercle's mailing list, for the president: how many people are where, the
// sender identity every message will carry, the CSV import, and the one
// confirmation message to the contacts who asked for nothing.
export function AdminCercleList() {
  const t = useTranslations('cercle');
  const stats = useQuery(api.cercleMailing.stats);
  const importContacts = useMutation(api.cercleMailing.importContacts);
  const sendConfirmations = useMutation(api.cercleMailing.sendConfirmations);
  const notify = useActionFeedback();

  const [batch, setBatch] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
  }

  async function onImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setReport(null);
    if (!batch.trim()) return setError(t('importErrBatch'));
    if (!text.trim()) return setError(t('importErrEmpty'));
    setImporting(true);
    try {
      setReport(await importContacts({ csv: text, batch: batch.trim() }));
      setText('');
    } catch (err) {
      setError(
        err instanceof ConvexError && err.data === 'EMPTY_FILE'
          ? t('importErrEmpty')
          : t('importErrGeneric'),
      );
    } finally {
      setImporting(false);
    }
  }

  async function onSend() {
    setSending(true);
    try {
      const { queued } = await sendConfirmations({});
      notify(t(queued > 0 ? 'confirmSendQueued' : 'confirmSendNothing'));
    } catch (err) {
      const code = err instanceof ConvexError ? err.data : null;
      notify(
        code === 'SENDER_IDENTITY_MISSING'
          ? t('confirmSendErr_SENDER_IDENTITY_MISSING')
          : code === 'EMAIL_PROVIDER_NOT_CONFIGURED'
            ? t('confirmSendErr_EMAIL_PROVIDER_NOT_CONFIGURED')
            : t('confirmSendErr'),
        'error',
      );
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl">{t('mailListTitle')}</h2>
        <p className="mt-2 max-w-[68ch] text-ink-soft">{t('listIntro')}</p>
      </div>

      {stats ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('statPending')} value={stats.pending} />
            <Stat label={t('statToAsk')} value={stats.toAsk} />
            <Stat label={t('statConfirmed')} value={stats.confirmed} />
            <Stat label={t('statUnsubscribed')} value={stats.unsubscribed} />
          </dl>
          {stats.capped ? (
            <p className="text-xs text-muted">{t('statCapped')}</p>
          ) : null}

          {stats.sender.placeholder ? (
            <div
              role="alert"
              className="rounded-md border border-bar-5 bg-surface p-4"
            >
              <p className="font-medium text-ink">{t('senderMissingTitle')}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {t('senderMissingBody')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              {t('senderOk', {
                name: stats.sender.name,
                address: stats.sender.address,
              })}
            </p>
          )}
          {stats.emailMode === 'none' ? (
            <p role="alert" className="text-sm text-bar-5">
              {t('emailNone')}
            </p>
          ) : stats.emailMode === 'simulated' ? (
            <p className="text-sm text-muted">{t('emailSimulated')}</p>
          ) : null}
        </>
      ) : null}

      <section aria-labelledby="cercle-import-title" className="space-y-3">
        <h3 id="cercle-import-title" className="font-display text-xl">
          {t('importTitle')}
        </h3>
        <p className="max-w-[68ch] text-sm text-ink-soft">{t('importHelp')}</p>
        <form onSubmit={onImport} noValidate className="max-w-xl space-y-3">
          <TextField
            label={t('importBatch')}
            hint={t('importBatchHint')}
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
          />
          <Field label={t('importFile')}>
            {(control) => (
              <input
                {...control}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={onFile}
                className="block min-h-11 w-full text-sm text-ink-soft file:me-3 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
              />
            )}
          </Field>
          <TextareaField
            label={t('importText')}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={error}
          />
          <Button type="submit" disabled={importing}>
            {importing ? t('importing') : t('importSubmit')}
          </Button>
        </form>

        {report ? (
          <div
            role="status"
            className="max-w-xl rounded-md border border-line bg-surface p-4"
          >
            <p className="font-medium text-ink">{t('importReportTitle')}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-soft">
              <li>{t('reportAdded', { count: report.added })}</li>
              <li>{t('reportAlready', { count: report.alreadyOnList })}</li>
              {report.suppressed > 0 ? (
                <li>{t('reportSuppressed', { count: report.suppressed })}</li>
              ) : null}
              {report.unmailable > 0 ? (
                <li>{t('reportUnmailable', { count: report.unmailable })}</li>
              ) : null}
              {report.duplicatesInFile > 0 ? (
                <li>
                  {t('reportDuplicates', { count: report.duplicatesInFile })}
                </li>
              ) : null}
              {report.invalid.length > 0 ? (
                <li>{t('reportInvalid', { count: report.invalid.length })}</li>
              ) : null}
              {report.truncated > 0 ? (
                <li>{t('reportTruncated', { count: report.truncated })}</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="cercle-confirm-title" className="space-y-3">
        <h3 id="cercle-confirm-title" className="font-display text-xl">
          {t('confirmSendTitle')}
        </h3>
        <p className="max-w-[68ch] text-sm text-ink-soft">
          {t('confirmSendBody')}
        </p>
        <Button
          type="button"
          disabled={sending || !stats || stats.toAsk === 0}
          onClick={() => setConfirming(true)}
        >
          {t('confirmSendButton')}
        </Button>
        <ConfirmDialog
          open={confirming}
          title={t('confirmSendDialog', { count: stats?.toAsk ?? 0 })}
          description={t('confirmSendBody')}
          confirmLabel={t('confirmSendConfirm')}
          cancelLabel={t('cancel')}
          pending={sending}
          onConfirm={onSend}
          onCancel={() => setConfirming(false)}
        />
      </section>
    </div>
  );
}
