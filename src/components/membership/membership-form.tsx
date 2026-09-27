'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
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
import { ConvexError } from 'convex/values';

// Seconde candidature « en attente » pour la même adresse (convex/organizations.ts
// -> ConvexError('DUPLICATE_APPLICATION'), lot 3 du 27/09) : la file du
// back-office se remplissait de doublons, et le candidat n'en savait rien.
function isDuplicateApplication(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'DUPLICATE_APPLICATION';
}
import { vocabulary } from '@/i18n/vocabulary';
import { resolveLocale } from '@/i18n/locale';
import { Check } from 'lucide-react';
import { StatusMessage } from '@/components/a11y/status-message';

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
  const locale = useLocale();
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
        // La langue du formulaire suit la candidature : c'est elle qui décidera
        // de la langue du courriel de validation d'adhésion, des mois plus tard.
        // Même relevé que les formulaires jeunes et mentorat.
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
            : isDuplicateApplication(err)
              ? t('duplicate')
              : t('errorGeneric'),
      );
      setStatus('idle');
    }
  }

  const types: ApplicantType[] = ['organisation', 'individu'];

  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
      {status === 'success' ? (
        <StatusMessage className="py-6">
          <h2 className="font-display text-2xl text-ink">
            {t('successTitle')}
          </h2>
          <p className="mt-3 max-w-[52ch] leading-relaxed text-ink-soft">
            {t('successBody')}
          </p>
        </StatusMessage>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <fieldset>
            <legend className="text-sm text-ink-soft">{t('typeLabel')}</legend>
            {/* Pas de `role="radiogroup"` ANONYME ici (RGAA 11.6) : il
                s'interposait entre les boutons radio et le `<fieldset>`, et le
                groupe annoncé n'avait plus de nom. Le `<fieldset>` suffit.
                Le bouton radio est masqué visuellement : c'est la pastille qui
                montre le focus (RGAA 10.7) et une coche qui montre la
                sélection sans passer par la seule couleur (RGAA 3.1). */}
            <div className="mt-2 flex flex-wrap gap-2">
              {types.map((opt) => (
                <label
                  key={opt}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text ${
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
                  {type === opt ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {vocabulary(t, 'type_', opt)}
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
