'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { useRecaptcha } from '@/components/providers/recaptcha-provider';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

// Formulaire d'inscription newsletter (F-18) — îlot client réutilisable (accueil
// + page /newsletter). Les libellés `placeholder`/`cta` sont passés en props ;
// les messages d'état viennent du namespace i18n `newsletter`. Idempotent côté
// serveur (une adresse déjà inscrite renvoie un succès sans doublon).
export function NewsletterForm({
  placeholder,
  cta,
  className,
}: {
  placeholder: string;
  cta: string;
  className?: string;
}) {
  const t = useTranslations('newsletter');
  const locale = useLocale();
  const subscribe = useAction(api.newsletter.subscribe);
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
      const captchaToken = await executeRecaptcha('newsletter');
      await subscribe({
        email,
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
      <p
        role="status"
        className={`text-sm font-medium text-bar-1 ${className ?? ''}`}
      >
        {t('success')}
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`w-full ${className ?? ''}`}
    >
      <div className="flex gap-2">
        <TextField
          label={placeholder}
          labelHidden
          className="flex-1"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={placeholder}
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
