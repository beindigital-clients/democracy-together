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
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';

// One step of "what happens next", on the confirmation: the applicant has no
// account yet, so e-mail is their only channel — they must know to watch it.
function NextStep({ n, children }: { n: number; children: string }) {
  return (
    <li className="flex gap-3 text-[15px] leading-relaxed text-ink-soft">
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent-edge font-mono text-xs text-accent-text"
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

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
        <div className="py-2">
          {/* What the screen reader reads on arrival (focus is moved here):
              the outcome and the address the confirmation goes to — shown
              on its own line, left to right, so a typo is caught now rather
              than never. */}
          <StatusMessage>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-text"
              >
                <Check className="h-5 w-5" />
              </span>
              <h2 className="font-display text-2xl text-ink">
                {t('successTitle')}
              </h2>
            </div>
            <p className="mt-4 max-w-[52ch] leading-relaxed text-ink-soft">
              {t('successBody')}
            </p>
            <p
              dir="ltr"
              className="mt-1 break-all font-mono text-sm font-medium text-ink"
            >
              {values.contactEmail.trim()}
            </p>
            <p className="mt-2 max-w-[52ch] text-sm text-muted">
              {t('successSpam')}
            </p>
          </StatusMessage>

          <h3 className="mt-7 font-display text-lg text-ink">
            {t('nextTitle')}
          </h3>
          <ol className="mt-3 space-y-3">
            <NextStep n={1}>{t('nextReview')}</NextStep>
            <NextStep n={2}>{t('nextAnswer')}</NextStep>
            <NextStep n={3}>{t('nextAccess')}</NextStep>
          </ol>

          <Link
            href="/le-reseau"
            className="mt-7 inline-block py-1 text-sm font-medium text-accent-text hover:underline"
          >
            {t('successExplore')} <ArrowForward />
          </Link>
        </div>
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

          {/* Autofill follows the label: a researcher's own name, not an
              organisation's. */}
          <TextField
            label={type === 'organisation' ? t('orgName') : t('personName')}
            autoComplete={type === 'organisation' ? 'organization' : 'name'}
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
