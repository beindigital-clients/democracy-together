'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isEmail } from '@/lib/validation';
import { isRateLimited } from '@/lib/errors';

// Formulaire d'inscription à un événement (F-53) — îlot client, sur la page de
// détail. Idempotent côté serveur (réinscription = succès sans doublon). Les
// libellés viennent du namespace i18n `eventRegister` ; le titre de l'événement
// est passé en prop pour personnaliser l'intro.
export function EventRegisterForm({
  eventSlug,
  eventTitle,
}: {
  eventSlug: string;
  eventTitle: string;
}) {
  const t = useTranslations('eventRegister');
  const locale = useLocale();
  const register = useMutation(api.events.registerForEvent);
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    const organization = String(fd.get('organization') ?? '').trim();
    if (name.length < 2) {
      setError(t('errorName'));
      return;
    }
    if (!isEmail(email)) {
      setError(t('errorInvalid'));
      return;
    }
    setStatus('pending');
    try {
      await register({
        eventSlug,
        name,
        email,
        organization: organization || undefined,
        locale: locale === 'en' ? 'en' : 'fr',
      });
      setStatus('success');
    } catch (err) {
      setError(isRateLimited(err) ? t('rateLimited') : t('errorGeneric'));
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-md border border-accent-edge bg-accent-tint p-4"
      >
        <p className="text-sm font-medium text-ink">{t('success')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-soft">
        {t('intro', { event: eventTitle })}
      </p>
      <div>
        <label htmlFor="ev-name" className="sr-only">
          {t('name')}
        </label>
        <Input
          id="ev-name"
          name="name"
          autoComplete="name"
          placeholder={t('name')}
          required
        />
      </div>
      <div>
        <label htmlFor="ev-email" className="sr-only">
          {t('email')}
        </label>
        <Input
          id="ev-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t('email')}
          required
        />
      </div>
      <div>
        <label htmlFor="ev-org" className="sr-only">
          {t('organization')}
        </label>
        <Input
          id="ev-org"
          name="organization"
          autoComplete="organization"
          placeholder={t('organizationOptional')}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-bar-5">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={status === 'pending'} className="w-full">
        {t('submit')}
      </Button>
      <p className="text-[11px] leading-relaxed text-muted">{t('privacy')}</p>
    </form>
  );
}
