'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

// Rappel d'événement (F-55) — îlot client, sur la page de détail d'un événement
// À VENIR. Le visiteur (sans compte) laisse son e-mail ; un cron quotidien
// enverra le rappel quelques jours avant. `eventDate` est calculé par
// l'appelant (Date.UTC). Idempotent côté serveur (redemander = succès sans
// doublon). Libellés du namespace i18n `reminder`.
export function ReminderForm({
  eventSlug,
  eventDate,
}: {
  eventSlug: string;
  eventDate: number;
}) {
  const t = useTranslations('reminder');
  const locale = useLocale();
  const requestReminder = useAction(api.eventReminders.requestReminder);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = formField(fd, 'email').trim();
    if (!isEmail(email)) {
      setError(t('errorInvalid'));
      return;
    }
    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('event_reminder');
      await requestReminder({
        eventSlug,
        email,
        eventDate,
        locale: locale === 'en' ? 'en' : 'fr',
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : t('errorGeneric'),
      );
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
      <p className="text-[13px] leading-relaxed text-ink-soft">{t('intro')}</p>
      <TextField
        label={t('email')}
        labelHidden
        id="rem-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder={t('email')}
        required
      />
      <FormError>{error}</FormError>
      <Button type="submit" disabled={status === 'pending'} className="w-full">
        {t('submit')}
      </Button>
      <p className="text-[11px] leading-relaxed text-muted">{t('privacy')}</p>
    </form>
  );
}
