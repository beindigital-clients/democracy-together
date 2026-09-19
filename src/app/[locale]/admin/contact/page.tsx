'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Doc } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// F-17 / F-26 — les messages de contact n'avaient AUCUN écran de lecture :
// ils s'accumulaient en base et `handled` n'était jamais mis à jour (audit
// § 3.1). Le formulaire public écrivait donc dans un trou noir.

function MessageRow({ msg }: { msg: Doc<'contactMessages'> }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const setHandled = useMutation(api.contact.setHandled);
  const [pending, setPending] = useState(false);

  const received = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(msg.createdAt);

  async function toggle() {
    setPending(true);
    try {
      await setHandled({ messageId: msg._id, handled: !msg.handled });
    } catch {
      // refus serveur (rôle insuffisant) : la liste réactive reste cohérente.
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">{msg.subject}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {t('contactFrom')} <b className="font-semibold text-ink">{msg.name}</b>{' '}
            ·{' '}
            <a
              href={`mailto:${msg.email}?subject=${encodeURIComponent(
                `Re: ${msg.subject}`,
              )}`}
              className="font-mono text-[13px] text-accent-text hover:underline"
            >
              {msg.email}
            </a>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {t('contactReceived')} {received}
          </p>
        </div>
        <Badge variant={msg.handled ? 'default' : 'accent'}>
          {msg.handled ? t('contactHandled') : t('contactPending')}
        </Badge>
      </div>

      <p className="mt-3 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink-soft">
        {msg.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={toggle} disabled={pending} variant={msg.handled ? 'outline' : 'default'}>
          {msg.handled ? t('contactMarkPending') : t('contactMarkHandled')}
        </Button>
        <a
          href={`mailto:${msg.email}?subject=${encodeURIComponent(
            `Re: ${msg.subject}`,
          )}`}
          className="inline-flex items-center justify-center rounded-sm px-4 py-2.5 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-tint"
        >
          {t('contactReply')}
        </a>
      </div>
    </li>
  );
}

export default function AdminContact() {
  const t = useTranslations('admin');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const messages = useQuery(api.contact.listMessages, { status: filter });

  return (
    <div>
      <h1 className="font-display text-3xl">{t('contactTitle')}</h1>

      <div className="mt-5 flex gap-2">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-accent-edge bg-accent-tint text-accent-text'
                : 'border-line bg-surface-2 text-ink-soft hover:text-ink'
            }`}
          >
            {t(f === 'pending' ? 'filterPending' : 'filterAll')}
          </button>
        ))}
      </div>

      {messages === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : messages.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('contactEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {messages.map((m) => (
            <MessageRow key={m._id} msg={m} />
          ))}
        </ul>
      )}
    </div>
  );
}
