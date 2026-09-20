'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { useRecaptcha } from '@/lib/recaptcha';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

type ApplicantType = 'organisation' | 'individu';

// Formulaire de candidature d'adhésion (F-22) — îlot client. Extrait de la page
// /adhesion pour pouvoir l'intégrer dans la mise en page éditoriale (sections
// serveur). Sélecteurs/i18n inchangés (tests E2E membership.spec).
export function MembershipForm() {
  const t = useTranslations('membership');
  const apply = useAction(api.organizations.submitApplication);
  const executeRecaptcha = useRecaptcha();
  const [type, setType] = useState<ApplicantType>('organisation');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const organizationName = formField(fd, 'organizationName').trim();
    const contactEmail = formField(fd, 'contactEmail').trim();
    const country = formField(fd, 'country').trim();
    const message = formField(fd, 'message').trim();

    if (
      organizationName.length < 2 ||
      !isEmail(contactEmail) ||
      country.length < 2
    ) {
      setError(t('errorInvalid'));
      return;
    }

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('membership');
      await apply({
        type,
        organizationName,
        contactEmail,
        country,
        message: message || undefined,
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
            name="organizationName"
            autoComplete="organization"
            required
          />

          <TextField
            label={t('email')}
            name="contactEmail"
            type="email"
            autoComplete="email"
            required
          />

          <TextField
            label={t('country')}
            name="country"
            autoComplete="country-name"
            required
          />

          <TextareaField
            label={t('message')}
            name="message"
            rows={5}
            placeholder={t('messagePlaceholder')}
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
