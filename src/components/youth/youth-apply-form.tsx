'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { PUB_THEMES } from '@/lib/publications';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useRecaptcha } from '@/components/providers/recaptcha-provider';
import { formField, isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = formField(fd, 'name').trim();
    const email = formField(fd, 'email').trim();
    const country = formField(fd, 'country').trim();
    const theme = formField(fd, 'theme').trim();
    const motivation = formField(fd, 'motivation').trim();
    if (name.length < 2) return setError(t('errName'));
    if (!isEmail(email)) return setError(t('errEmail'));
    if (country.length < 2) return setError(t('errCountry'));
    if (motivation.length < 10) return setError(t('errMotivation'));

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('youth_apply');
      await apply({
        name,
        email,
        country,
        themes: theme ? [theme] : undefined,
        motivation,
        locale: locale === 'en' ? 'en' : 'fr',
        captchaToken,
      });
      setStatus('success');
    } catch (err) {
      setError(
        isCaptchaFailed(err)
          ? t('captchaFailed')
          : isRateLimited(err)
            ? t('rateLimited')
            : t('errGeneric'),
      );
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-md border border-accent-edge bg-accent-tint p-5"
      >
        <p className="font-medium text-ink">{t('success')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2"
    >
      <div>
        <label htmlFor="y-name" className="block text-sm text-ink-soft">
          {t('name')}
        </label>
        <Input id="y-name" name="name" autoComplete="name" required className="mt-1" />
      </div>
      <div>
        <label htmlFor="y-email" className="block text-sm text-ink-soft">
          {t('email')}
        </label>
        <Input
          id="y-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="y-country" className="block text-sm text-ink-soft">
          {t('country')}
        </label>
        <Input id="y-country" name="country" required className="mt-1" />
      </div>
      <div>
        <label htmlFor="y-theme" className="block text-sm text-ink-soft">
          {t('theme')}
        </label>
        <select
          id="y-theme"
          name="theme"
          defaultValue=""
          className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink"
        >
          <option value="">{t('themeNone')}</option>
          {PUB_THEMES.map((s) => (
            <option key={s} value={s}>
              {tl(`themes.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="y-motivation" className="block text-sm text-ink-soft">
          {t('motivation')}
        </label>
        <Textarea
          id="y-motivation"
          name="motivation"
          rows={4}
          required
          placeholder={t('motivationPlaceholder')}
          className="mt-1 resize-y"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-bar-5 sm:col-span-2">
          {error}
        </p>
      ) : null}
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
