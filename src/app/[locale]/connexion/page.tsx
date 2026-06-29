'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, Field, FormError, SubmitButton } from '@/components/auth/form';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';

export default function ConnexionPage() {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      await signIn('password', {
        email: String(fd.get('email')),
        password: String(fd.get('password')),
        flow: 'signIn',
      });
      redirectAfterAuth();
    } catch {
      setError(t('errorSignIn'));
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('signInTitle')} subtitle={t('signInSubtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('email')} name="email" type="email" autoComplete="email" required />
        <PasswordField
          label={t('password')}
          name="password"
          autoComplete="current-password"
          required
        />
        <div className="text-right">
          <Link
            href="/mot-de-passe-oublie"
            className="text-sm text-accent-text hover:underline"
          >
            {t('forgotPassword')}
          </Link>
        </div>
        <FormError>{error}</FormError>
        <SubmitButton pending={pending}>{t('signInCta')}</SubmitButton>
      </form>

      <Button asChild variant="outline" className="mt-4 w-full">
        <Link href="/connexion-otp">{t('signInWithCode')}</Link>
      </Button>

      <p className="mt-6 text-sm text-ink-soft">
        {t('noAccount')}{' '}
        <Link href="/adhesion" className="text-accent-text hover:underline">
          {tNav('join')}
        </Link>
      </p>
    </AuthCard>
  );
}
