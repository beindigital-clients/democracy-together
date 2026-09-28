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

// Second "pending" application for the same address (convex/organizations.ts
// -> ConvexError('DUPLICATE_APPLICATION'), batch 3 of 27/09): the
// back-office queue was filling up with duplicates, and the applicant knew nothing of it.
function isDuplicateApplication(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'DUPLICATE_APPLICATION';
}
import { vocabulary } from '@/i18n/vocabulary';
import { resolveLocale } from '@/i18n/locale';
import { Check } from 'lucide-react';
import { StatusMessage } from '@/components/a11y/status-message';

type ApplicantType = 'organisation' | 'individu';

// Membership application form (F-22) — client island. Extracted from the
// /adhesion page so it can be embedded in the editorial layout (server
// sections). Selectors/i18n unchanged (E2E tests membership.spec).
//
// This is the form issue #37 referred to: three rejection causes, a single
// message at the bottom of the page. Each rule now carries its field, and the
// presentation — the longest field to write — survives a server rejection.
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
        // The form's language follows the application: it is what will decide
        // the language of the membership approval email, months later.
        // Same capture as the youth and mentoring forms.
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
            {/* No ANONYMOUS `role="radiogroup"` here (RGAA 11.6): it
                sat between the radio buttons and the `<fieldset>`, and the
                announced group no longer had a name. The `<fieldset>` is enough.
                The radio button is visually hidden: it is the chip that
                shows focus (RGAA 10.7) and a check mark that shows the
                selection without relying on colour alone (RGAA 3.1). */}
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
