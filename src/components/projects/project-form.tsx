'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/roles';
import { PUB_THEMES } from '@/lib/publications';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { isRateLimited } from '@/lib/errors';

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

  const member = isMember(me?.role);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const theme = String(fd.get('theme') ?? '').trim();
    const title = String(fd.get('title') ?? '').trim();
    const summary = String(fd.get('summary') ?? '').trim();
    if (!(PUB_THEMES as readonly string[]).includes(theme)) {
      return setError(t('errTheme'));
    }
    if (title.length < 4) return setError(t('errTitle'));
    if (summary.length < 20) return setError(t('errSummary'));

    setStatus('pending');
    try {
      await submit({ theme, title, summary });
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
      className="grid gap-4 rounded-md border border-line bg-surface p-6"
    >
      <div>
        <label htmlFor="p-theme" className="block text-sm text-ink-soft">
          {t('fieldTheme')}
        </label>
        <select
          id="p-theme"
          name="theme"
          defaultValue=""
          required
          className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink"
        >
          <option value="" disabled>
            {t('themePlaceholder')}
          </option>
          {PUB_THEMES.map((s) => (
            <option key={s} value={s}>
              {tl(`themes.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="p-title" className="block text-sm text-ink-soft">
          {t('fieldTitle')}
        </label>
        <Input
          id="p-title"
          name="title"
          required
          maxLength={160}
          placeholder={t('titlePlaceholder')}
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="p-summary" className="block text-sm text-ink-soft">
          {t('fieldSummary')}
        </label>
        <Textarea
          id="p-summary"
          name="summary"
          rows={5}
          required
          placeholder={t('summaryPlaceholder')}
          className="mt-1 resize-y"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-bar-5">
          {error}
        </p>
      ) : null}
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
