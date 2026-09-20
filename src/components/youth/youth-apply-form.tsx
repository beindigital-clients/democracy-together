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
} from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { formField, isEmail } from '@/lib/validation';
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = formField(fd, 'name').trim();
    const email = formField(fd, 'email').trim();
    const country = formField(fd, 'country').trim();
    const theme = formField(fd, 'theme').trim();
    const motivation = formField(fd, 'motivation').trim();
    if (name.length < 2) return setError(t('errName'));
    if (!isEmail(email)) return setError(t('errEmail'));
    if (country.length < 2) return setError(t('errCountry'));
    if (motivation.length < 10) return setError(t('errMotivation'));

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('youth_apply');
      await apply({
        name,
        email,
        country,
        themes: theme ? [theme] : undefined,
        motivation,
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
      className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2"
    >
      <TextField
        label={t('name')}
        id="y-name"
        name="name"
        autoComplete="name"
        required
      />
      <TextField
        label={t('email')}
        id="y-email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <TextField label={t('country')} id="y-country" name="country" required />
      <SelectField label={t('theme')} id="y-theme" name="theme" defaultValue="">
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
        name="motivation"
        rows={4}
        required
        placeholder={t('motivationPlaceholder')}
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
