'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { PUB_THEMES } from '@/lib/publications';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';
import { isRateLimited } from '@/lib/errors';
import { vocabulary } from '@/i18n/vocabulary';

// Proposition de projet collaboratif (F-60) — îlot client sur /appels-a-projets.
// Réservé aux membres : un visiteur (anonyme ou compte sans rôle membre) est
// invité à adhérer ; un membre choisit un axe, un titre et un résumé.
export function ProjectForm() {
  const t = useTranslations('projects');
  const tl = useTranslations('library');
  const me = useQuery(api.users.current);
  const submit = useMutation(api.projects.submitProject);
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { values, field, validate } = useFormFields({
    theme: '',
    title: '',
    summary: '',
  });

  const member = isMember(me?.role);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (
      !validate({
        theme: (v) =>
          (PUB_THEMES as readonly string[]).includes(v) ? null : t('errTheme'),
        title: (v) => (v.trim().length < 4 ? t('errTitle') : null),
        summary: (v) => (v.trim().length < 20 ? t('errSummary') : null),
      })
    ) {
      return;
    }

    setStatus('pending');
    try {
      await submit({
        theme: values.theme,
        title: values.title.trim(),
        summary: values.summary.trim(),
      });
      setStatus('success');
      router.refresh();
    } catch (err) {
      setError(isRateLimited(err) ? t('rateLimited') : t('errGeneric'));
      setStatus('idle');
    }
  }

  // En attente de l'identité (évite un flash visiteur -> membre).
  if (me === undefined) {
    return (
      <div className="rounded-md border border-line bg-surface p-6 text-ink-soft">
        {t('loading')}
      </div>
    );
  }

  // Visiteur (non connecté ou compte sans rôle membre) : invitation à adhérer.
  if (!member) {
    return (
      <div className="rounded-md border border-line bg-surface p-6">
        <h3 className="font-display text-xl">{t('gateTitle')}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {t('gateBody')}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/adhesion">{t('gateJoin')}</Link>
          </Button>
          {me === null ? (
            <Button asChild variant="outline">
              <Link href="/connexion">{t('gateSignIn')}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-md border border-accent-edge bg-accent-tint p-5"
      >
        <p className="font-medium text-ink">{t('success')}</p>
        <p className="mt-1 text-[14px] text-ink-soft">{t('successBody')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4 rounded-md border border-line bg-surface p-6"
    >
      <SelectField
        label={t('fieldTheme')}
        id="p-theme"
        required
        {...field('theme')}
      >
        <option value="" disabled>
          {t('themePlaceholder')}
        </option>
        {PUB_THEMES.map((s) => (
          <option key={s} value={s}>
            {vocabulary(tl, 'themes.', s)}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t('fieldTitle')}
        id="p-title"
        required
        maxLength={160}
        placeholder={t('titlePlaceholder')}
        {...field('title')}
      />
      <TextareaField
        label={t('fieldSummary')}
        id="p-summary"
        rows={5}
        required
        placeholder={t('summaryPlaceholder')}
        {...field('summary')}
      />
      <FormError>{error}</FormError>
      <div>
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
