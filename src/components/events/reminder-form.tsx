'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { resolveLocale } from '@/i18n/locale';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';
import { StatusMessage } from '@/components/a11y/status-message';

// Event reminder (F-55) — client island, on the detail page of an UPCOMING
// event. The visitor (without an account) leaves their e-mail; a daily cron
// will send the reminder a few days before. The reminder date is the
// event's, READ SERVER-SIDE from the table (pentest M-5): this form no
// longer sends it. Idempotent server-side (asking again = success without
// duplicate). Labels from the `reminder` i18n namespace.
export function ReminderForm({ eventSlug }: { eventSlug: string }) {
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
        locale: resolveLocale(locale),
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
      <StatusMessage className="rounded-md border border-accent-edge bg-accent-tint p-4">
        <p className="text-sm font-medium text-ink">{t('success')}</p>
      </StatusMessage>
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
