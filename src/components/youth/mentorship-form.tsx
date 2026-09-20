'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { resolveLocale } from '@/i18n/locale';
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
import { useRecaptcha } from '@/components/providers/recaptcha-provider';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

const ROLES = ['mentore', 'mentor'] as const;

// `validate` rend un booléen, pas un type : c'est cette garde qui rétrécit la
// valeur du select au vocabulaire attendu par l'action Convex.
function isRole(value: string): value is (typeof ROLES)[number] {
  return (ROLES as readonly string[]).includes(value);
}

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
  const { values, field, validate } = useFormFields({
    role: 'mentore',
    name: '',
    email: '',
    country: '',
    theme: '',
    message: '',
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const ok = validate({
      role: (v) => (isRole(v) ? null : t('errRole')),
      name: (v) => (v.trim().length < 2 ? t('errName') : null),
      email: (v) => (isEmail(v) ? null : t('errEmail')),
      country: (v) => (v.trim().length < 2 ? t('errCountry') : null),
      message: (v) => (v.trim().length < 10 ? t('errMessage') : null),
    });
    const role = values.role;
    if (!ok || !isRole(role)) return;

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('mentorship');
      const theme = values.theme.trim();
      await request({
        name: values.name.trim(),
        email: values.email.trim(),
        country: values.country.trim(),
        role,
        themes: theme ? [theme] : undefined,
        message: values.message.trim(),
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
      <SelectField label={t('role')} id="m-role" {...field('role')}>
        <option value="mentore">{t('roleMentee')}</option>
        <option value="mentor">{t('roleMentor')}</option>
      </SelectField>
      <TextField
        label={t('name')}
        id="m-name"
        autoComplete="name"
        required
        {...field('name')}
      />
      <TextField
        label={t('email')}
        id="m-email"
        type="email"
        autoComplete="email"
        required
        {...field('email')}
      />
      <TextField
        label={t('country')}
        id="m-country"
        required
        {...field('country')}
      />
      <SelectField
        label={t('theme')}
        className="sm:col-span-2"
        id="m-theme"
        {...field('theme')}
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
        rows={4}
        required
        placeholder={t('messagePlaceholder')}
        {...field('message')}
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
