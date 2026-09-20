'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { TextField, TextareaField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';

export default function AdminNewsletter() {
  const t = useTranslations('admin');
  const count = useQuery(api.newsletter.subscriberCount);
  const campaigns = useQuery(api.newsletter.listCampaigns);
  const create = useMutation(api.newsletter.createCampaign);
  const send = useMutation(api.newsletter.sendCampaign);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (subject.trim().length < 3 || body.trim().length < 10) return;
    setPending(true);
    try {
      await create({ subject, body });
      setSubject('');
      setBody('');
    } catch {
      /* refusé côté serveur (rôle) : on n'insiste pas */
    } finally {
      setPending(false);
    }
  }

  async function onSend(id: string) {
    setSendingId(id);
    try {
      await send({ campaignId: id as Id<'newsletterCampaigns'> });
    } catch {
      /* idem */
    } finally {
      setSendingId(null);
    }
  }

  const badge = (status: string) =>
    status === 'sent'
      ? 'default'
      : status === 'sending'
        ? 'accent'
        : status === 'error'
          ? 'default'
          : 'default';

  return (
    <div>
      <h1 className="font-display text-3xl">{t('newsletter')}</h1>
      <p className="mt-2 text-ink-soft">
        {t('nlSubscribers', { count: count ?? 0 })}
      </p>

      <form
        onSubmit={onCreate}
        className="mt-6 space-y-4 rounded-md border border-line bg-surface p-5"
      >
        <TextField
          label={t('nlSubject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={150}
        />
        <TextareaField
          label={t('nlBody')}
          hint={t('nlBodyHint')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={8}
        />
        <Button type="submit" disabled={pending} variant="outline">
          {t('nlCreate')}
        </Button>
      </form>

      <h2 className="mt-10 font-display text-xl">{t('nlCampaigns')}</h2>
      {campaigns === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : campaigns.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('nlEmpty')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {campaigns.map((c) => (
            <li
              key={c._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-ink">{c.subject}</h3>
                  <Badge variant={badge(c.status)}>
                    {t(`nlStatus_${c.status}`)}
                  </Badge>
                </div>
                {c.status === 'sent' ? (
                  <p className="mt-1 text-xs text-muted">
                    {t('nlSentInfo', {
                      sent: c.recipientCount ?? 0,
                      failed: c.failedCount ?? 0,
                    })}
                  </p>
                ) : null}
              </div>
              {c.status === 'draft' ? (
                <Button
                  size="sm"
                  onClick={() => onSend(c._id)}
                  disabled={sendingId === c._id}
                >
                  {t('nlSend', { count: count ?? 0 })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
