'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { resolveLocale } from '@/i18n/locale';
import { api } from '@convex/_generated/api';
import { FIELD_MAX } from '@convex/lib/validation';
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
import { vocabulary } from '@/i18n/vocabulary';
import { StatusMessage } from '@/components/a11y/status-message';

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

  // Bornes ALIGNÉES sur le serveur (`convex/youth.ts` via `FIELD_MAX`) : une
  // motivation de 5 000 caractères était refusée sous « L'envoi a échoué »
  // sans que la limite (4 000) soit dite nulle part (mesuré le 27/09, A-04).
  const motivationMax = FIELD_MAX.body;

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
        motivation: (v) =>
          v.trim().length < 10
            ? t('errMotivation')
            : v.trim().length > motivationMax
              ? t('errMotivationLong', { max: motivationMax })
              : null,
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
        locale: resolveLocale(locale),
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      // Le refus serveur de longueur porte son code (`ConvexError`) : il est
      // dit tel quel, au lieu d'être rabattu sur le message générique.
      const code =
        err instanceof ConvexError && typeof err.data === 'string'
          ? err.data
          : null;
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : code === 'INVALID_MOTIVATION'
              ? t('errMotivationLong', { max: motivationMax })
              : t('errGeneric'),
      );
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <StatusMessage className="rounded-md border border-accent-edge bg-accent-tint p-5">
        <p className="font-medium text-ink">{t('success')}</p>
        {/* Dédoublonnage doux (une candidature en attente par adresse) : la
            réponse du serveur ne distingue pas les deux cas — c'est voulu, un
            formulaire public ne doit pas révéler qu'une adresse est connue
            (pentest M-8). On le DIT donc dans tous les cas, sans le trahir. */}
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          {t('successDedupe')}
        </p>
      </StatusMessage>
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
        maxLength={FIELD_MAX.name}
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
        // Finalité déclarée pour le remplissage automatique (RGAA 11.13).
        autoComplete="country-name"
        required
        maxLength={FIELD_MAX.country}
        {...field('country')}
      />
      <SelectField label={t('theme')} id="y-theme" {...field('theme')}>
        <option value="">{t('themeNone')}</option>
        {PUB_THEMES.map((s) => (
          <option key={s} value={s}>
            {vocabulary(tl, 'themes.', s)}
          </option>
        ))}
      </SelectField>
      <TextareaField
        label={t('motivation')}
        className="sm:col-span-2"
        id="y-motivation"
        rows={4}
        required
        maxLength={motivationMax}
        hint={
          <span className="wrap-anywhere">
            {t('charCount', {
              count: values.motivation.length,
              max: motivationMax,
            })}
          </span>
        }
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
