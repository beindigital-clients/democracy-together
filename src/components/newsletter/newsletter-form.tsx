'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { resolveLocale } from '@/i18n/locale';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import {
  isCaptchaFailed,
  isEmailProviderMissing,
  isRateLimited,
} from '@/lib/errors';
import { StatusMessage } from '@/components/a11y/status-message';

// Newsletter sign-up form (F-18) — reusable client island (home page
// + /newsletter page). The `placeholder`/`cta` labels are passed as props;
// status messages come from the `newsletter` i18n namespace. Idempotent on the
// server (an already-subscribed address returns success without a duplicate).
//
// DOUBLE OPT-IN (diffusion workstream): success announces a confirmation
// email, not a subscription. `source` says which form the
// consent came from — it is kept with the proof (GDPR art. 7.1).
export type NewsletterSource = 'home' | 'footer' | 'newsletter-page';

export function NewsletterForm({
  placeholder,
  cta,
  source,
  className,
}: {
  placeholder: string;
  cta: string;
  source: NewsletterSource;
  className?: string;
}) {
  const t = useTranslations('newsletter');
  const locale = useLocale();
  const subscribe = useAction(api.newsletter.subscribe);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate } = useFormFields({ email: '' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // A single field, hence a single message — but attached to the field, not placed
    // beside it: the field carries `aria-invalid` and is what the message describes.
    if (!validate({ email: (v) => (isEmail(v) ? null : t('errorInvalid')) })) {
      return;
    }
    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('newsletter');
      await subscribe({
        email: values.email.trim(),
        locale: resolveLocale(locale),
        source,
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : isEmailProviderMissing(err)
              ? t('unavailable')
              : t('errorGeneric'),
      );
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <StatusMessage
        as="p"
        className={`text-sm font-medium text-bar-1 ${className ?? ''}`}
      >
        {t('success')}
      </StatusMessage>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`w-full ${className ?? ''}`}
    >
      {/* `items-start`: the error message is written below the field; without
          it, the button would stretch to the block's height. */}
      <div className="flex items-start gap-2">
        <TextField
          label={placeholder}
          labelHidden
          className="flex-1"
          type="email"
          required
          autoComplete="email"
          placeholder={placeholder}
          {...field('email')}
        />
        <Button
          type="submit"
          disabled={status === 'pending'}
          className="shrink-0"
        >
          {cta}
        </Button>
      </div>
      <FormError className="mt-2">{error}</FormError>
    </form>
  );
}
