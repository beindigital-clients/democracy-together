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
import { useRecaptcha } from '@/components/providers/recaptcha-provider';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

// Mentorat — mise en relation (F-59). Îlot client sur /jeunes (#mentorat). Sans
// compte. On choisit son rôle (mentoré : cherche un mentor / mentor : propose
// son accompagnement). Axe d'intérêt facultatif (relie aux 5 axes du réseau).
export function MentorshipForm() {
  const t = useTranslations('mentorship');
  const tl = useTranslations('library');
  const locale = useLocale();
  const request = useAction(api.mentorship.requestMentorship);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const role = formField(fd, 'role').trim();
    const name = formField(fd, 'name').trim();
    const email = formField(fd, 'email').trim();
    const country = formField(fd, 'country').trim();
    const theme = formField(fd, 'theme').trim();
    const message = formField(fd, 'message').trim();
    if (role !== 'mentore' && role !== 'mentor') return setError(t('errRole'));
    if (name.length < 2) return setError(t('errName'));
    if (!isEmail(email)) return setError(t('errEmail'));
    if (country.length < 2) return setError(t('errCountry'));
    if (message.length < 10) return setError(t('errMessage'));

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('mentorship');
      await request({
        name,
        email,
        country,
        role,
        themes: theme ? [theme] : undefined,
        message,
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
      <SelectField
        label={t('role')}
        id="m-role"
        name="role"
        defaultValue="mentore"
      >
        <option value="mentore">{t('roleMentee')}</option>
        <option value="mentor">{t('roleMentor')}</option>
      </SelectField>
      <TextField
        label={t('name')}
        id="m-name"
        name="name"
        autoComplete="name"
        required
      />
      <TextField
        label={t('email')}
        id="m-email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <TextField label={t('country')} id="m-country" name="country" required />
      <SelectField
        label={t('theme')}
        className="sm:col-span-2"
        id="m-theme"
        name="theme"
        defaultValue=""
      >
        <option value="">{t('themeNone')}</option>
        {PUB_THEMES.map((s) => (
          <option key={s} value={s}>
            {tl(`themes.${s}`)}
          </option>
        ))}
      </SelectField>
      <TextareaField
        label={t('message')}
        className="sm:col-span-2"
        id="m-message"
        name="message"
        rows={4}
        required
        placeholder={t('messagePlaceholder')}
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
