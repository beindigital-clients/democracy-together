'use client';

import { useId, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { isEmail } from '@/lib/validation';
import { isRateLimited } from '@/lib/errors';

export default function ContactPage() {
  const t = useTranslations('contact');
  const submit = useMutation(api.contact.submit);
  const ids = {
    name: useId(),
    email: useId(),
    subject: useId(),
    body: useId(),
  };
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    const subject = String(fd.get('subject') ?? '').trim();
    const body = String(fd.get('body') ?? '').trim();

    if (
      name.length < 2 ||
      !isEmail(email) ||
      subject.length < 2 ||
      body.length < 10
    ) {
      setError(t('errorInvalid'));
      return;
    }

    setStatus('pending');
    try {
      await submit({ name, email, subject, body });
      setStatus('success');
    } catch (err) {
      setError(isRateLimited(err) ? t('rateLimited') : t('errorGeneric'));
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
              <div>
                <label
                  htmlFor={ids.name}
                  className="block text-sm text-ink-soft"
                >
                  {t('name')}
                </label>
                <Input
                  id={ids.name}
                  name="name"
                  autoComplete="name"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label
                  htmlFor={ids.email}
                  className="block text-sm text-ink-soft"
                >
                  {t('email')}
                </label>
                <Input
                  id={ids.email}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label
                  htmlFor={ids.subject}
                  className="block text-sm text-ink-soft"
                >
                  {t('subject')}
                </label>
                <Input
                  id={ids.subject}
                  name="subject"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label
                  htmlFor={ids.body}
                  className="block text-sm text-ink-soft"
                >
                  {t('message')}
                </label>
                <Textarea
                  id={ids.body}
                  name="body"
                  rows={6}
                  required
                  placeholder={t('messagePlaceholder')}
                  className="mt-1 resize-y"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-bar-5">
                  {error}
                </p>
              ) : null}

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
