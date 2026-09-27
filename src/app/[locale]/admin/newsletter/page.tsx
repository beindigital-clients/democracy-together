'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { Button } from '@/components/ui/button';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CampaignPreview } from '@/components/admin/campaign-preview';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';

type Campaign = FunctionReturnType<typeof api.newsletter.listCampaigns>[number];
type EmailStatus = FunctionReturnType<typeof api.newsletter.emailStatus>;

// Bornes du brouillon — les mêmes que `createCampaign` (INVALID_CAMPAIGN).
const SUBJECT_MIN = 3;
const BODY_MIN = 10;

// L'ÉTAT DU FOURNISSEUR D'E-MAIL, EN TÊTE (campagne du 27/09, R-07 / m-4).
// Une campagne partait « Envoyée · 3 envoyés » sans qu'aucun fournisseur
// n'existe (envoi simulé de dev), et en production elle aurait fini « Erreur »
// sans un mot. Même principe que /admin/moderation-ia pour sa clé : l'état
// s'annonce AVANT de composer, et l'envoi est refusé quand rien ne partira.
function EmailStatusBanner({ status }: { status: EmailStatus | undefined }) {
  const t = useTranslations('admin');
  if (status === undefined) return null;
  const warning = status.mode !== 'configured';
  return (
    <p
      role="status"
      className={`mt-4 rounded-sm border p-3 text-sm ${
        warning
          ? 'border-accent-edge bg-accent-tint text-accent-text'
          : 'border-line bg-surface-2 text-ink-soft'
      }`}
    >
      {status.mode === 'configured'
        ? t('nlEmailStatus_configured', { provider: status.provider })
        : status.mode === 'simulated'
          ? t('nlEmailStatus_simulated')
          : t('nlEmailStatus_none')}
    </p>
  );
}

function CampaignRow({
  campaign,
  subscribers,
  canSend,
}: {
  campaign: Campaign;
  subscribers: number;
  // `false` sans fournisseur : le bouton reste, désactivé et expliqué, plutôt
  // que de disparaître sans raison.
  canSend: boolean;
}) {
  const t = useTranslations('admin');
  const send = useMutation(api.newsletter.sendCampaign);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  // L'envoi est IRRÉVERSIBLE et touche tous les abonnés : il passe par une
  // confirmation qui nomme la campagne et le nombre de destinataires (motif
  // de l'issue #38), puis annonce son départ — il ne s'annonçait pas (m-4).
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

  const badge = campaign.status === 'sending' ? 'accent' : 'default';

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
                failed: campaign.failedCount ?? 0,
              })}
            </p>
          ) : campaign.status === 'error' ? (
            <p className="mt-1 text-xs text-bar-5">
              {t('nlErrorInfo', { failed: campaign.failedCount ?? 0 })}
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
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={pending || !canSend}
            >
              {t('nlSend', { count: subscribers })}
            </Button>
          ) : null}
        </div>
      </div>
      {campaign.status === 'draft' && !canSend ? (
        <p className="mt-2 text-xs text-muted">
          {t('nlSendDisabledNoProvider')}
        </p>
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
  const count = useQuery(api.newsletter.subscriberCount);
  const campaigns = useQuery(api.newsletter.listCampaigns);
  const emailStatus = useQuery(api.newsletter.emailStatus);
  const create = useMutation(api.newsletter.createCampaign);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Le garde sortait en silence (m-4) : l'objet de 2 caractères ou le
    // message de 5 ne produisait ni message ni refus visible.
    if (subject.trim().length < SUBJECT_MIN || body.trim().length < BODY_MIN) {
      setError(t('nlTooShort'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await create({ subject, body });
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

      <form
        onSubmit={onCreate}
        noValidate
        className="mt-6 space-y-4 rounded-md border border-line bg-surface p-5"
      >
        <TextField
          label={t('nlSubject')}
          hint={t('nlSubjectHint')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          minLength={SUBJECT_MIN}
          maxLength={150}
        />
        <TextareaField
          label={t('nlBody')}
          hint={t('nlBodyHint')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={BODY_MIN}
          rows={8}
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
    </div>
  );
}
