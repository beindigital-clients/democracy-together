'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { PUB_THEMES } from '@/lib/publications';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

// Candidature au hub Jeunes (F-58) — îlot client sur /jeunes (#rejoindre). Sans
// compte. Axe d'intérêt facultatif (relie aux 5 axes du réseau).
export function YouthApplyForm() {
  const t = useTranslations('youthApply');
  const tl = useTranslations('library');
  const locale = useLocale();
  const apply = useAction(api.youth.applyYouth);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate } = useFormFields({
    name: '',
    email: '',
    country: '',
    theme: '',
    motivation: '',
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Les messages existaient déjà, un par cause — mais tous affichés au même
    // endroit, en bas. Ils vont maintenant à leur champ.
    if (
      !validate({
        name: (v) => (v.trim().length < 2 ? t('errName') : null),
        email: (v) => (isEmail(v) ? null : t('errEmail')),
        country: (v) => (v.trim().length < 2 ? t('errCountry') : null),
        motivation: (v) => (v.trim().length < 10 ? t('errMotivation') : null),
      })
    ) {
      return;
    }

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('youth_apply');
      const theme = values.theme.trim();
      await apply({
        name: values.name.trim(),
        email: values.email.trim(),
        country: values.country.trim(),
        themes: theme ? [theme] : undefined,
        motivation: values.motivation.trim(),
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
            : t('errGeneric'),
      );
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-md border border-accent-edge bg-accent-tint p-5"
      >
        <p className="font-medium text-ink">{t('success')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2"
    >
      <TextField
        label={t('name')}
        id="y-name"
        autoComplete="name"
        required
        {...field('name')}
      />
      <TextField
        label={t('email')}
        id="y-email"
        type="email"
        autoComplete="email"
        required
        {...field('email')}
      />
      <TextField
        label={t('country')}
        id="y-country"
        required
        {...field('country')}
      />
      <SelectField label={t('theme')} id="y-theme" {...field('theme')}>
        <option value="">{t('themeNone')}</option>
        {PUB_THEMES.map((s) => (
          <option key={s} value={s}>
            {tl(`themes.${s}`)}
          </option>
        ))}
      </SelectField>
      <TextareaField
        label={t('motivation')}
        className="sm:col-span-2"
        id="y-motivation"
        rows={4}
        required
        placeholder={t('motivationPlaceholder')}
        {...field('motivation')}
      />
      <FormError className="sm:col-span-2">{error}</FormError>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={status === 'pending'}>
          {t('submit')}
        </Button>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {t('privacy')}
        </p>
      </div>
    </form>
  );
}
