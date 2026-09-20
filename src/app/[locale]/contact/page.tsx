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
import { Reveal } from '@/components/motion/reveal';
import { useRecaptcha } from '@/lib/recaptcha';
import { isEmail } from '@/lib/validation';
import { isCaptchaFailed, isRateLimited } from '@/lib/errors';

export default function ContactPage() {
  const t = useTranslations('contact');
  const submit = useAction(api.contact.submit);
  const executeRecaptcha = useRecaptcha();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Les valeurs vivent ici, pas dans le DOM : un refus serveur (rate-limit,
  // reCAPTCHA) laisse le message rédigé intact.
  const { values, field, validate } = useFormFields({
    name: '',
    email: '',
    subject: '',
    body: '',
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Une règle par champ, dans l'ordre d'affichage : le message va au champ
    // qui l'a causé, et le premier champ fautif reçoit le focus.
    if (
      !validate({
        name: (v) => (v.trim().length < 2 ? t('errName') : null),
        email: (v) => (isEmail(v) ? null : t('errEmail')),
        subject: (v) => (v.trim().length < 2 ? t('errSubject') : null),
        body: (v) => (v.trim().length < 10 ? t('errMessage') : null),
      })
    ) {
      return;
    }

    setStatus('pending');
    try {
      const captchaToken = await executeRecaptcha('contact');
      await submit({
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject.trim(),
        body: values.body.trim(),
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

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <header>
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
              {t('eyebrow')}
            </p>
            <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
              {t('title')}
            </h1>
            <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
              {t('subtitle')}
            </p>

            <div className="mt-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                {t('hubsTitle')}
              </p>
              <p className="mt-2 text-sm text-ink-soft">{t('hubs')}</p>
            </div>
          </Reveal>
        </header>

        <Reveal
          delay={0.08}
          className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8"
        >
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
              <TextField
                label={t('name')}
                autoComplete="name"
                required
                {...field('name')}
              />

              <TextField
                label={t('email')}
                type="email"
                autoComplete="email"
                required
                {...field('email')}
              />

              <TextField label={t('subject')} required {...field('subject')} />

              <TextareaField
                label={t('message')}
                rows={6}
                required
                placeholder={t('messagePlaceholder')}
                {...field('body')}
              />

              <FormError>{error}</FormError>

              <Button
                type="submit"
                disabled={status === 'pending'}
                className="w-full sm:w-auto"
              >
                {status === 'pending' ? t('sending') : t('send')}
              </Button>
            </form>
          )}
        </Reveal>
      </div>
    </div>
  );
}
