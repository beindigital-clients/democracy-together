'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import {
  FormError,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

type ApplicantType = 'organisation' | 'individu';

// Formulaire de candidature d'adhésion (F-22) — îlot client. Extrait de la page
// /adhesion pour pouvoir l'intégrer dans la mise en page éditoriale (sections
// serveur). Sélecteurs/i18n inchangés (tests E2E membership.spec).
//
// C'est le formulaire que citait l'issue #37 : trois causes de refus, un seul
// message en bas de page. Chaque règle porte désormais son champ, et la
// présentation — le champ le plus long à écrire — survit à un refus serveur.
export function MembershipForm() {
  const t = useTranslations('membership');
  const apply = useAction(api.organizations.submitApplication);
  const executeRecaptcha = useRecaptcha();
  const [type, setType] = useState<ApplicantType>('organisation');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate } = useFormFields({
    organizationName: '',
    contactEmail: '',
    country: '',
    message: '',
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (
      !validate({
        organizationName: (v) => (v.trim().length < 2 ? t('errName') : null),
        contactEmail: (v) => (isEmail(v) ? null : t('errEmail')),
        country: (v) => (v.trim().length < 2 ? t('errCountry') : null),
      })
    ) {
      return;
    }

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('membership');
      await apply({
        type,
        organizationName: values.organizationName.trim(),
        contactEmail: values.contactEmail.trim(),
        country: values.country.trim(),
        message: values.message.trim() || undefined,
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

  const types: ApplicantType[] = ['organisation', 'individu'];

  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
      {status === 'success' ? (
        <div role="status" className="py-6">
          <h2 className="font-display text-2xl text-ink">
            {t('successTitle')}
          </h2>
          <p className="mt-3 max-w-[52ch] leading-relaxed text-ink-soft">
            {t('successBody')}
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <fieldset>
            <legend className="text-sm text-ink-soft">{t('typeLabel')}</legend>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
              {types.map((opt) => (
                <label
                  key={opt}
                  className={`cursor-pointer rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors ${
                    type === opt
                      ? 'border-accent-edge bg-accent-tint text-accent-text'
                      : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={opt}
                    checked={type === opt}
                    onChange={() => setType(opt)}
                    className="sr-only"
                  />
                  {t(`type_${opt}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <TextField
            label={type === 'organisation' ? t('orgName') : t('personName')}
            autoComplete="organization"
            required
            {...field('organizationName')}
          />

          <TextField
            label={t('email')}
            type="email"
            autoComplete="email"
            required
            {...field('contactEmail')}
          />

          <TextField
            label={t('country')}
            autoComplete="country-name"
            required
            {...field('country')}
          />

          <TextareaField
            label={t('message')}
            rows={5}
            placeholder={t('messagePlaceholder')}
            {...field('message')}
          />

          <FormError>{error}</FormError>

          <Button
            type="submit"
            disabled={status === 'pending'}
            className="w-full sm:w-auto"
          >
            {status === 'pending' ? t('sending') : t('submit')}
          </Button>
        </form>
      )}
    </div>
  );
}
