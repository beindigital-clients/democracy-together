'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { SITE_LOCALES } from '@convex/lib/locales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextField, TextareaField } from '@/components/ui/field';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { intlLocale } from '@/i18n/locale';

/** Name of a site language, in the screen's language. */
function useLanguageName(): (code: string) => string {
  const locale = useLocale();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: 'language' });
    } catch {
      names = null;
    }
    return (code: string) => names?.of(code) ?? code;
  }, [locale]);
}

type Campaign = FunctionReturnType<typeof api.newsletter.listCampaigns>[number];

function errorCode(err: unknown): string | null {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : null;
}

function CampaignFailures({ campaign }: { campaign: Campaign }) {
  const t = useTranslations('cercle');
  const failures = useQuery(api.newsletter.campaignFailedRecipients, {
    campaignId: campaign._id,
  });
  if (!failures || failures.length === 0) return null;
  return (
    <div className="mt-3 text-sm">
      <p className="font-medium text-ink">{t('msgFailuresTitle')}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-ink-soft">
        {failures.map((f, i) => (
          <li key={i} dir="ltr" className="wrap-anywhere">
            {t('msgFailureLine', { email: f.email, error: f.error })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignCard({
  campaign,
  confirmed,
}: {
  campaign: Campaign;
  confirmed: number;
}) {
  const t = useTranslations('cercle');
  const locale = useLocale();
  const notify = useActionFeedback();
  const sendTest = useMutation(api.newsletter.sendTestCampaign);
  const send = useMutation(api.newsletter.sendCampaign);
  const release = useMutation(api.newsletter.releaseNextWave);
  const retry = useMutation(api.newsletter.retryFailedDeliveries);

  const [addresses, setAddresses] = useState('');
  const [waveSize, setWaveSize] = useState('');
  const [nextWave, setNextWave] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const statusLabel = {
    draft: t('msgStatus_draft'),
    sending: t('msgStatus_sending'),
    paused: t('msgStatus_paused'),
    sent: t('msgStatus_sent'),
    error: t('msgStatus_error'),
  }[campaign.status];

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        dateStyle: 'long',
        timeStyle: 'short',
      }),
    [locale],
  );

  async function onTest(e: FormEvent) {
    e.preventDefault();
    const list = addresses
      .split(/[,;\s]+/)
      .map((a) => a.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      const res = await sendTest({
        campaignId: campaign._id,
        ...(list.length > 0 ? { to: list } : {}),
      });
      notify(t('msgTestSent', { to: res.to }));
    } catch (err) {
      const code = errorCode(err);
      notify(
        code === 'NOT_INTERNAL_ADDRESS'
          ? t('msgTestErr_NOT_INTERNAL_ADDRESS')
          : code === 'TOO_MANY_TEST_RECIPIENTS'
            ? t('msgTestErr_TOO_MANY_TEST_RECIPIENTS')
            : code === 'INVALID_EMAIL'
              ? t('msgTestErr_INVALID_EMAIL')
              : t('msgTestErr'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    setBusy(true);
    try {
      const size = waveSize.trim() === '' ? undefined : Number(waveSize);
      await send({
        campaignId: campaign._id,
        ...(size !== undefined ? { waveSize: size } : {}),
      });
      notify(t('msgSendStarted'));
    } catch (err) {
      const code = errorCode(err);
      notify(
        code === 'TEST_REQUIRED'
          ? t('msgSendErr_TEST_REQUIRED')
          : code === 'SENDER_IDENTITY_MISSING'
            ? t('msgSendErr_SENDER_IDENTITY_MISSING')
            : code === 'INVALID_WAVE_SIZE'
              ? t('msgSendErr_INVALID_WAVE_SIZE')
              : t('msgSendErr'),
        'error',
      );
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function onRelease(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await release({ campaignId: campaign._id, size: Number(nextWave) });
      notify(t('msgReleased'));
      setNextWave('');
    } catch {
      notify(t('msgReleaseErr'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onRetry() {
    setBusy(true);
    try {
      await retry({ campaignId: campaign._id });
      notify(t('msgRetried'));
    } catch (err) {
      notify(
        errorCode(err) === 'SENDER_IDENTITY_MISSING'
          ? t('msgSendErr_SENDER_IDENTITY_MISSING')
          : t('msgRetryErr'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  const failed = campaign.failedCount ?? 0;

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 wrap-anywhere font-display text-lg text-ink">
          {campaign.subject}
        </h3>
        <Badge variant={campaign.status === 'error' ? 'bad' : 'default'}>
          {statusLabel}
        </Badge>
      </div>

      {campaign.status !== 'draft' ? (
        <p className="mt-2 text-sm text-ink-soft">
          {t('msgProgress', {
            sent: campaign.recipientCount ?? 0,
            total: campaign.totalCount,
            failed,
            skipped: campaign.skippedCount,
          })}
        </p>
      ) : null}
      {campaign.pausedUntil !== null && campaign.status === 'sending' ? (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {t('msgPausedUntil', { date: fmt.format(campaign.pausedUntil) })}
        </p>
      ) : null}

      {campaign.status === 'draft' ? (
        <div className="mt-4 space-y-5">
          <form onSubmit={onTest} className="space-y-2">
            <p className="font-medium text-ink">{t('msgTestTitle')}</p>
            <TextField
              label={t('msgTestLabel')}
              hint={t('msgTestHint')}
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              dir="ltr"
            />
            <Button type="submit" variant="outline" disabled={busy}>
              {t('msgTestSend')}
            </Button>
          </form>

          <div className="space-y-2">
            <p className="font-medium text-ink">{t('msgSendTitle')}</p>
            {campaign.needsTest ? (
              <p className="text-sm text-bar-5">{t('msgNeedsTest')}</p>
            ) : null}
            <TextField
              label={t('msgWaveLabel')}
              inputMode="numeric"
              value={waveSize}
              onChange={(e) => setWaveSize(e.target.value.replace(/\D/g, ''))}
              controlClassName="w-32"
            />
            <Button
              type="button"
              disabled={busy || campaign.needsTest}
              onClick={() => setConfirming(true)}
            >
              {t('msgSendButton')}
            </Button>
            <ConfirmDialog
              open={confirming}
              title={t('msgSendDialog', { subject: campaign.subject })}
              description={t('msgSendDialogBody', { count: confirmed })}
              confirmLabel={t('msgSendConfirm')}
              cancelLabel={t('cancel')}
              pending={busy}
              onConfirm={onSend}
              onCancel={() => setConfirming(false)}
            />
          </div>
        </div>
      ) : null}

      {campaign.status === 'paused' ? (
        <form onSubmit={onRelease} className="mt-4 space-y-2">
          <p role="status" className="text-sm text-ink-soft">
            {t('msgWavePaused', { limit: campaign.waveLimit ?? 0 })}
          </p>
          <TextField
            label={t('msgReleaseLabel')}
            inputMode="numeric"
            value={nextWave}
            onChange={(e) => setNextWave(e.target.value.replace(/\D/g, ''))}
            controlClassName="w-32"
          />
          <Button type="submit" disabled={busy || nextWave === ''}>
            {t('msgRelease')}
          </Button>
        </form>
      ) : null}

      {failed > 0 &&
      (campaign.status === 'sent' || campaign.status === 'error') ? (
        <div className="mt-3">
          <CampaignFailures campaign={campaign} />
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={onRetry}
          >
            {t('msgRetry')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

// Messages to the Cercle: compose, test with the team, send — at once or in
// waves — and follow what failed. The engine is the newsletter's, audience
// `cercle`; every rule shown here (test first, sender identity, waves, daily
// quota) is enforced by the server, this screen only mirrors it.
export function AdminCercleMessages() {
  const t = useTranslations('cercle');
  const lang = useLanguageName();
  const campaigns = useQuery(api.newsletter.listCampaigns, {
    audience: 'cercle',
  });
  const stats = useQuery(api.cercleMailing.stats);
  const create = useMutation(api.newsletter.createCampaign);
  const notify = useActionFeedback();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [language, setLanguage] = useState<(typeof SITE_LOCALES)[number]>('fr');
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ subject, body, locale: language, audience: 'cercle' });
      setSubject('');
      setBody('');
      notify(t('msgCreated'));
    } catch {
      notify(t('msgCreateErr'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl">{t('msgTitle')}</h2>
        <p className="mt-2 max-w-[68ch] text-ink-soft">{t('msgIntro')}</p>
      </div>

      <form
        onSubmit={onCreate}
        aria-labelledby="cercle-msg-new"
        className="max-w-xl space-y-3 rounded-md border border-line bg-surface p-5"
      >
        <h3 id="cercle-msg-new" className="font-display text-xl">
          {t('msgNewTitle')}
        </h3>
        <TextField
          label={t('msgSubject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <TextareaField
          label={t('msgBody')}
          hint={t('msgBodyHint')}
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          {t('msgLocale')}
          <select
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value as (typeof SITE_LOCALES)[number])
            }
            className="min-h-10 rounded-sm border border-line-field bg-surface px-2"
          >
            {SITE_LOCALES.map((l) => (
              <option key={l} value={l}>
                {lang(l)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {t('msgCreate')}
        </Button>
      </form>

      <section aria-labelledby="cercle-msg-list">
        <h3 id="cercle-msg-list" className="font-display text-xl">
          {t('msgListTitle')}
        </h3>
        {campaigns === undefined ? (
          <p className="mt-3 text-ink-soft">…</p>
        ) : campaigns.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t('msgEmpty')}</p>
        ) : (
          <ul aria-labelledby="cercle-msg-list" className="mt-3 space-y-3">
            {campaigns.map((c) => (
              <CampaignCard
                key={c._id}
                campaign={c}
                confirmed={stats?.confirmed ?? 0}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
