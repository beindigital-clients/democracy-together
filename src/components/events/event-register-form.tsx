'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { resolveLocale } from '@/i18n/locale';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';
import { StatusMessage } from '@/components/a11y/status-message';

// Event registration form (F-53) — client island, on the detail page.
// Idempotent server-side (re-registering = success without duplicate). The
// labels come from the `eventRegister` i18n namespace; the event title
// is passed as a prop to personalize the intro.
export function EventRegisterForm({
  eventSlug,
  eventTitle,
}: {
  eventSlug: string;
  eventTitle: string;
}) {
  const t = useTranslations('eventRegister');
  const locale = useLocale();
  const register = useAction(api.events.registerForEvent);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = formField(fd, 'name').trim();
    const email = formField(fd, 'email').trim();
    const organization = formField(fd, 'organization').trim();
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
      const captchaToken = await executeRecaptcha('event_register');
      await register({
        eventSlug,
        name,
        email,
        organization: organization || undefined,
        locale: resolveLocale(locale),
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      // Past or unknown event: the server now refuses (A-03) and says
      // so — the detail page no longer renders this form, but a page left
      // open while the event went by can still submit it.
      const closed = err instanceof ConvexError && err.data === 'EVENT_CLOSED';
      // Capacity reached between displaying the detail page and submitting.
      const full = err instanceof ConvexError && err.data === 'EVENT_FULL';
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : closed
              ? t('closed')
              : full
                ? t('full')
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
      <p className="text-[13px] leading-relaxed text-ink-soft">
        {t('intro', { event: eventTitle })}
      </p>
      <TextField
        label={t('name')}
        labelHidden
        id="ev-name"
        name="name"
        autoComplete="name"
        placeholder={t('name')}
        required
      />
      <TextField
        label={t('email')}
        labelHidden
        id="ev-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder={t('email')}
        required
      />
      <TextField
        label={t('organization')}
        labelHidden
        id="ev-org"
        name="organization"
        autoComplete="organization"
        placeholder={t('organizationOptional')}
      />
      <FormError>{error}</FormError>
      <Button type="submit" disabled={status === 'pending'} className="w-full">
        {t('submit')}
      </Button>
      <p className="text-[11px] leading-relaxed text-muted">{t('privacy')}</p>
    </form>
  );
}
