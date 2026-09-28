'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CampaignPreview } from '@/components/admin/campaign-preview';
import { LoadMore } from '@/components/admin/load-more';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { routing } from '@/i18n/routing';

type Campaign = FunctionReturnType<typeof api.newsletter.listCampaigns>[number];
type EmailStatus = FunctionReturnType<typeof api.newsletter.emailStatus>;
type SiteLocale = (typeof routing.locales)[number];

// Draft bounds — the same as `createCampaign` (INVALID_CAMPAIGN).
const SUBJECT_MIN = 3;
const BODY_MIN = 10;
const PAGE = 20;

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

// THE EMAIL PROVIDER STATE, AT THE TOP (27/09 campaign, R-07 / m-4).
// A campaign went out as "Envoyée · 3 envoyés" without any provider
// existing (simulated dev sending), and in production it would have ended as "Erreur"
// without a word. Same principle as /admin/moderation-ia for its key: the state
// is announced BEFORE composing, and sending is refused when nothing will go out.
function EmailStatusBanner({ status }: { status: EmailStatus | undefined }) {
  const t = useTranslations('admin');
  const tn = useTranslations('newsletter');
  if (status === undefined) return null;
  const warning = status.mode !== 'configured';
  return (
    <div
      role="status"
      className={`mt-4 rounded-sm border p-3 text-sm ${
        warning
          ? 'border-accent-edge bg-accent-tint text-accent-text'
          : 'border-line bg-surface-2 text-ink-soft'
      }`}
    >
      <p>
        {status.mode === 'configured'
          ? t('nlEmailStatus_configured', { provider: status.provider })
          : status.mode === 'simulated'
            ? t('nlEmailStatus_simulated')
            : t('nlEmailStatus_none')}
      </p>
      {status.mode !== 'none' ? (
        <p className="mt-1 text-xs">
          {tn('adminRateInfo', {
            size: status.batchSize,
            rate: status.ratePerMinute,
          })}
        </p>
      ) : null}
    </div>
  );
}

// --- Subscribers -----------------------------------------------------------------

function SubscriberStats() {
  const tn = useTranslations('newsletter');
  const stats = useQuery(api.newsletter.subscriberBreakdown);
  const show = (n: number | undefined) =>
    n === undefined ? '—' : stats && n >= stats.capped ? `${n}+` : String(n);
  const tiles = [
    {
      key: 'confirmed',
      label: tn('adminStatConfirmed'),
      value: stats?.confirmed,
      accent: true,
    },
    {
      key: 'pending',
      label: tn('adminStatPending'),
      value: stats?.pending,
      accent: false,
    },
    {
      key: 'legacy',
      label: tn('adminStatLegacy'),
      value: stats?.legacy,
      accent: false,
    },
  ];
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className={`rounded-md border p-4 ${
              tile.accent
                ? 'border-accent-edge bg-accent-tint'
                : 'border-line bg-surface'
            }`}
          >
            <p className="text-xs text-muted">{tile.label}</p>
            <p
              className={`mt-1 font-display text-2xl ${
                tile.accent ? 'text-accent-text' : 'text-ink'
              }`}
            >
              {show(tile.value)}
            </p>
          </div>
        ))}
      </div>
      {stats && stats.legacy > 0 ? (
        <p className="mt-3 wrap-anywhere text-sm text-ink-soft">
          {tn('adminLegacyHint')}
        </p>
      ) : null}
    </>
  );
}

function SubscriberList() {
  const tn = useTranslations('newsletter');
  const format = useFormatter();
  const lang = useLanguageName();
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [draft, setDraft] = useState('');
  const [email, setEmail] = useState('');
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsletter.listSubscribers,
    email ? { email } : filter === 'all' ? {} : { status: filter },
    { initialNumItems: PAGE },
  );
  const date = (ms: number) =>
    format.dateTime(new Date(ms), { dateStyle: 'medium' });

  return (
    <section className="mt-10" aria-labelledby="nl-subscribers">
      <h2 id="nl-subscribers" className="font-display text-xl">
        {tn('adminSubscribers')}
      </h2>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <SelectField
          label={tn('adminFilterLabel')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            setEmail('');
            setDraft('');
          }}
          className="w-48"
        >
          {(['all', 'confirmed', 'pending'] as const).map((f) => (
            <option key={f} value={f}>
              {vocabulary(tn, 'adminFilter_', f)}
            </option>
          ))}
        </SelectField>
        <form
          role="search"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setEmail(draft.trim());
          }}
        >
          <TextField
            label={tn('adminSearchLabel')}
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-72 max-w-full"
          />
          <Button type="submit" variant="outline">
            {tn('adminSearchCta')}
          </Button>
          {email ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEmail('');
                setDraft('');
              }}
            >
              {tn('adminSearchClear')}
            </Button>
          ) : null}
        </form>
      </div>

      {status === 'LoadingFirstPage' ? null : results.length === 0 ? (
        <p className="mt-4 text-ink-soft">{tn('adminSubscribersEmpty')}</p>
      ) : (
        <ul
          aria-label={tn('adminSubscribers')}
          className="mt-4 divide-y divide-line rounded-md border border-line bg-surface"
        >
          {results.map((s) => (
            <li key={s._id} className="flex flex-wrap items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="wrap-anywhere font-medium text-ink">{s.email}</p>
                <p className="mt-0.5 wrap-anywhere text-xs text-muted">
                  {s.consentAt !== null
                    ? tn('adminConsent', {
                        date: date(s.consentAt),
                        source: vocabulary(
                          tn,
                          'adminSource_',
                          s.consentSource ?? 'other',
                        ),
                      })
                    : null}
                  {s.confirmedAt !== null
                    ? ` · ${tn('adminConfirmedAt', { date: date(s.confirmedAt) })}`
                    : null}
                  {s.locale ? ` · ${lang(s.locale)}` : null}
                </p>
              </div>
              <Badge variant={s.status === 'confirmed' ? 'accent' : 'default'}>
                {vocabulary(tn, 'adminStatus_', s.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE} />
    </section>
  );
}

// --- Translated versions of a draft --------------------------------------

function VariantsEditor({ campaign }: { campaign: Campaign }) {
  const tn = useTranslations('newsletter');
  const lang = useLanguageName();
  const upsert = useMutation(api.newsletter.upsertCampaignVariant);
  const remove = useMutation(api.newsletter.removeCampaignVariant);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const available = routing.locales.filter((l) => l !== campaign.locale);
  const [editing, setEditing] = useState<SiteLocale | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  function open(loc: SiteLocale) {
    const existing = campaign.variants.find((v) => v.locale === loc);
    setEditing(loc);
    setSubject(existing?.subject ?? campaign.subject);
    setBody(existing?.body ?? campaign.body);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setPending(true);
    try {
      await upsert({
        campaignId: campaign._id,
        locale: editing,
        subject,
        body,
      });
      notify(tn('adminVariantSaved', { lang: lang(editing) }));
      setEditing(null);
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  async function drop(loc: SiteLocale) {
    try {
      await remove({ campaignId: campaign._id, locale: loc });
      notify(tn('adminVariantRemoved', { lang: lang(loc) }));
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="mt-4 rounded-sm border border-line bg-surface-2 p-3">
      <p className="text-sm font-medium text-ink">{tn('adminVariants')}</p>
      <p className="mt-0.5 text-xs text-muted">{tn('adminVariantsHint')}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {tn('adminReference', { lang: lang(campaign.locale) })}
      </p>
      {campaign.variants.length === 0 ? (
        <p className="mt-1 text-sm text-ink-soft">{tn('adminVariantsNone')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {campaign.variants.map((v) => (
            <li key={v.locale} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 wrap-anywhere text-sm text-ink">
                {lang(v.locale)} — {v.subject}
              </span>
              <Button size="sm" variant="ghost" onClick={() => open(v.locale)}>
                {tn('adminVariantEdit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => drop(v.locale)}>
                {tn('adminVariantRemove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-3">
          <SelectField
            label={tn('adminVariantLocale')}
            value={editing}
            onChange={(e) => open(e.target.value as SiteLocale)}
          >
            {available.map((l) => (
              <option key={l} value={l}>
                {lang(l)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={tn('adminVariantLocale') + ' — ' + lang(editing)}
            labelHidden
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            dir="auto"
          />
          <TextareaField
            label={lang(editing)}
            labelHidden
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            dir="auto"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {tn('adminVariantSave')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              {tn('adminVariantCancel')}
            </Button>
          </div>
        </form>
      ) : available.length > campaign.variants.length ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() =>
            open(
              available.find(
                (l) => !campaign.variants.some((v) => v.locale === l),
              ) ?? available[0],
            )
          }
        >
          {tn('adminVariantAdd')}
        </Button>
      ) : null}
    </div>
  );
}

// --- Send progress --------------------------------------------------

function DeliveryProgress({ campaign }: { campaign: Campaign }) {
  const tn = useTranslations('newsletter');
  const sent = campaign.recipientCount ?? 0;
  const failed = campaign.failedCount ?? 0;
  const skipped = campaign.skippedCount;
  const total = campaign.totalCount;
  const done = sent + failed + skipped;
  const percent =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const text =
    campaign.status === 'sending' && !campaign.enqueueDone && total === 0
      ? tn('adminQueueing')
      : tn('adminProgressText', { done, total, sent, failed, skipped });
  return (
    <ProgressBar
      className="mt-3"
      label={tn('adminProgress')}
      percent={percent}
      text={text}
    />
  );
}

function FailureReasons({
  campaignId,
}: {
  campaignId: Id<'newsletterCampaigns'>;
}) {
  const tn = useTranslations('newsletter');
  const reasons = useQuery(api.newsletter.campaignFailures, { campaignId });
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="mt-2 text-xs text-ink-soft">
      <p className="font-medium">{tn('adminFailures')}</p>
      <ul className="mt-1 space-y-0.5">
        {reasons.map((r) => (
          <li key={r.error} className="wrap-anywhere font-mono">
            {r.count} × {r.error}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignRow({
  campaign,
  subscribers,
  canSend,
}: {
  campaign: Campaign;
  subscribers: number;
  // `false` without a provider: the button stays, disabled and explained, rather
  // than disappearing for no reason.
  canSend: boolean;
}) {
  const t = useTranslations('admin');
  const tn = useTranslations('newsletter');
  const format = useFormatter();
  const send = useMutation(api.newsletter.sendCampaign);
  const sendTest = useMutation(api.newsletter.sendTestCampaign);
  const retry = useMutation(api.newsletter.retryFailedDeliveries);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  // Sending is IRREVERSIBLE and reaches all confirmed subscribers: it goes
  // through a confirmation that names the campaign and the number of recipients
  // (the issue #38 pattern), then announces its departure.
  async function onSend() {
    setPending(true);
    try {
      await send({ campaignId: campaign._id });
      setConfirming(false);
      notify(
        t('nlSendStarted', { subject: campaign.subject, count: subscribers }),
      );
    } catch (err) {
      setConfirming(false);
      fail(err);
    } finally {
      setPending(false);
    }
  }

  async function onTest() {
    setPending(true);
    try {
      const r = await sendTest({ campaignId: campaign._id });
      notify(tn('adminTestSent', { to: r.to, count: r.versions }));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  async function onRetry() {
    setPending(true);
    try {
      await retry({ campaignId: campaign._id });
      notify(tn('adminRetryStarted', { subject: campaign.subject }));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  const badge = campaign.status === 'sending' ? 'accent' : 'default';
  const failed = campaign.failedCount ?? 0;

  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
              {campaign.subject}
            </h3>
            <Badge variant={badge}>
              {vocabulary(t, 'nlStatus_', campaign.status)}
            </Badge>
          </div>
          {campaign.status === 'sent' ? (
            <p className="mt-1 text-xs text-muted">
              {t('nlSentInfo', {
                sent: campaign.recipientCount ?? 0,
                failed,
              })}
            </p>
          ) : campaign.status === 'error' ? (
            <p className="mt-1 text-xs text-bar-5">
              {t('nlErrorInfo', { failed })}
            </p>
          ) : null}
          {campaign.lastTestAt !== null ? (
            <p className="mt-1 text-xs text-muted">
              {tn('adminLastTest', {
                date: format.dateTime(new Date(campaign.lastTestAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-expanded={preview}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? t('nlPreviewHide') : t('nlPreviewShow')}
          </Button>
          {campaign.status === 'draft' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onTest}
                disabled={pending || !canSend}
              >
                {tn('adminSendTest')}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={pending || !canSend}
              >
                {t('nlSend', { count: subscribers })}
              </Button>
            </>
          ) : (campaign.status === 'sent' || campaign.status === 'error') &&
            failed > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={pending || !canSend}
            >
              {tn('adminRetry')}
            </Button>
          ) : null}
        </div>
      </div>
      {campaign.status === 'draft' && !canSend ? (
        <p className="mt-2 text-xs text-muted">
          {t('nlSendDisabledNoProvider')}
        </p>
      ) : null}
      {campaign.status !== 'draft' ? (
        <DeliveryProgress campaign={campaign} />
      ) : null}
      {failed > 0 ? <FailureReasons campaignId={campaign._id} /> : null}
      {campaign.status === 'draft' ? (
        <VariantsEditor campaign={campaign} />
      ) : null}
      {preview ? (
        <div className="mt-3">
          <CampaignPreview subject={campaign.subject} body={campaign.body} />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={t('nlConfirmSendTitle', {
          subject: campaign.subject,
          count: subscribers,
        })}
        description={t('nlConfirmSendBody')}
        confirmLabel={t('nlConfirmSendConfirm')}
        cancelLabel={t('confirmCancel')}
        pending={pending}
        onConfirm={onSend}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

export default function AdminNewsletter() {
  const t = useTranslations('admin');
  const tn = useTranslations('newsletter');
  const uiLocale = useLocale();
  const lang = useLanguageName();
  const count = useQuery(api.newsletter.subscriberCount);
  const campaigns = useQuery(api.newsletter.listCampaigns);
  const emailStatus = useQuery(api.newsletter.emailStatus);
  const create = useMutation(api.newsletter.createCampaign);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reference, setReference] = useState<SiteLocale>(
    (routing.locales as readonly string[]).includes(uiLocale)
      ? (uiLocale as SiteLocale)
      : 'fr',
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The guard returned silently (m-4): a 2-character subject or a
    // 5-character message produced neither a message nor a visible refusal.
    if (subject.trim().length < SUBJECT_MIN || body.trim().length < BODY_MIN) {
      setError(t('nlTooShort'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await create({ subject, body, locale: reference });
      notify(t('nlCreated', { subject: subject.trim() }));
      setSubject('');
      setBody('');
      setPreview(false);
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  }

  const canSend = emailStatus !== undefined && emailStatus.mode !== 'none';

  return (
    <div>
      <h1 className="font-display text-3xl">{t('newsletter')}</h1>
      <p className="mt-2 text-ink-soft">
        {t('nlSubscribers', { count: count ?? 0 })}
      </p>

      <EmailStatusBanner status={emailStatus} />
      <SubscriberStats />

      <form
        onSubmit={onCreate}
        noValidate
        className="mt-6 space-y-4 rounded-md border border-line bg-surface p-5"
      >
        <SelectField
          label={tn('adminReferenceLocale')}
          hint={tn('adminReferenceLocaleHint')}
          value={reference}
          onChange={(e) => setReference(e.target.value as SiteLocale)}
          className="max-w-xs"
        >
          {routing.locales.map((l) => (
            <option key={l} value={l}>
              {lang(l)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('nlSubject')}
          hint={t('nlSubjectHint')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          minLength={SUBJECT_MIN}
          maxLength={150}
          dir="auto"
        />
        <TextareaField
          label={t('nlBody')}
          hint={t('nlBodyHint')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={BODY_MIN}
          rows={8}
          dir="auto"
        />
        <FormError>{error}</FormError>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} variant="outline">
            {t('nlCreate')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={preview}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? t('nlPreviewHide') : t('nlPreviewShow')}
          </Button>
        </div>
        {preview ? <CampaignPreview subject={subject} body={body} /> : null}
      </form>

      <h2 className="mt-10 font-display text-xl">{t('nlCampaigns')}</h2>
      {campaigns === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : campaigns.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('nlEmpty')}</p>
      ) : (
        <ul aria-label={t('nlCampaigns')} className="mt-4 space-y-3">
          {campaigns.map((c) => (
            <CampaignRow
              key={c._id}
              campaign={c}
              subscribers={count ?? 0}
              canSend={canSend}
            />
          ))}
        </ul>
      )}

      <SubscriberList />
    </div>
  );
}
