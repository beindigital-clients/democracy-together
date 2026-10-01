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
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';
import { vocabulary } from '@/i18n/vocabulary';
import { StatusMessage } from '@/components/a11y/status-message';

// Application to the Youth hub (F-58) — client island on /jeunes (#rejoindre). No
// account needed. Optional theme of interest (linked to the network's 5 themes).
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

  // Limits ALIGNED with the server (`convex/youth.ts` via `FIELD_MAX`): a
  // 5,000-character motivation was rejected under "L'envoi a échoué"
  // without the limit (4,000) being stated anywhere (measured on 27/09, A-04).
  const motivationMax = FIELD_MAX.body;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // The messages already existed, one per cause — but all shown in the same
    // place, at the bottom. They now go to their field.
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
      // The server's length rejection carries its code (`ConvexError`): it is
      // stated as is, instead of being folded into the generic message.
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
        {/* Soft deduplication (one pending application per address): the
            server's response does not distinguish the two cases — that is intended, a
            public form must not reveal that an address is known
            (pentest M-8). So we SAY it in every case, without giving it away. */}
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
        // Declared purpose for autofill (RGAA 11.13).
        autoComplete="country-name"
        required
        maxLength={FIELD_MAX.country}
        {...field('country')}
      />
      <SelectField
        label={t('theme')}
        id="y-theme"
        {...field('theme')}
        onValueChange={field('theme').onChange}
        emptyLabel={t('themeNone')}
        options={PUB_THEMES.map((s) => ({
          value: s,
          label: vocabulary(tl, 'themes.', s),
        }))}
      />
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
