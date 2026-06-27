'use client';

import { useId, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { isEmail } from '@/lib/validation';
import { isRateLimited } from '@/lib/errors';

type ApplicantType = 'organisation' | 'individu';

// Formulaire de candidature d'adhésion (F-22) — îlot client. Extrait de la page
// /adhesion pour pouvoir l'intégrer dans la mise en page éditoriale (sections
// serveur). Sélecteurs/i18n inchangés (tests E2E membership.spec).
export function MembershipForm() {
  const t = useTranslations('membership');
  const apply = useMutation(api.organizations.submitApplication);
  const ids = {
    name: useId(),
    email: useId(),
    country: useId(),
    message: useId(),
  };
  const [type, setType] = useState<ApplicantType>('organisation');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const organizationName = String(fd.get('organizationName') ?? '').trim();
    const contactEmail = String(fd.get('contactEmail') ?? '').trim();
    const country = String(fd.get('country') ?? '').trim();
    const message = String(fd.get('message') ?? '').trim();

    if (organizationName.length < 2 || !isEmail(contactEmail) || country.length < 2) {
      setError(t('errorInvalid'));
      return;
    }

    setStatus('pending');
    try {
      await apply({
        type,
        organizationName,
        contactEmail,
        country,
        message: message || undefined,
      });
      setStatus('success');
    } catch (err) {
      setError(isRateLimited(err) ? t('rateLimited') : t('errorGeneric'));
      setStatus('idle');
    }
  }

  const types: ApplicantType[] = ['organisation', 'individu'];

  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
      {status === 'success' ? (
        <div role="status" className="py-6">
          <h2 className="font-display text-2xl text-ink">{t('successTitle')}</h2>
          <p className="mt-3 max-w-[52ch] leading-relaxed text-ink-soft">{t('successBody')}</p>
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

          <div>
            <label htmlFor={ids.name} className="block text-sm text-ink-soft">
              {type === 'organisation' ? t('orgName') : t('personName')}
            </label>
            <Input id={ids.name} name="organizationName" autoComplete="organization" required className="mt-1" />
          </div>

          <div>
            <label htmlFor={ids.email} className="block text-sm text-ink-soft">{t('email')}</label>
            <Input id={ids.email} name="contactEmail" type="email" autoComplete="email" required className="mt-1" />
          </div>

          <div>
            <label htmlFor={ids.country} className="block text-sm text-ink-soft">{t('country')}</label>
            <Input id={ids.country} name="country" autoComplete="country-name" required className="mt-1" />
          </div>

          <div>
            <label htmlFor={ids.message} className="block text-sm text-ink-soft">{t('message')}</label>
            <Textarea
              id={ids.message}
              name="message"
              rows={5}
              placeholder={t('messagePlaceholder')}
              className="mt-1 resize-y"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-bar-5">{error}</p>
          ) : null}

          <Button type="submit" disabled={status === 'pending'} className="w-full sm:w-auto">
            {status === 'pending' ? t('sending') : t('submit')}
          </Button>
        </form>
      )}
    </div>
  );
}
