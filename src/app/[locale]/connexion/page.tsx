'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { isEmail } from '@/lib/validation';

export default function ConnexionPage() {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { values, field, validate } = useFormFields({
    email: '',
    password: '',
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Ce qui est vérifiable ICI va au champ : une adresse mal formée, un mot de
    // passe vide. Le REFUS du serveur, lui, reste global — dire lequel des deux
    // est faux renseignerait sur l'existence du compte.
    if (
      !validate({
        email: (v) => (isEmail(v) ? null : t('errEmail')),
        password: (v) => (v.length === 0 ? t('errPassword') : null),
      })
    ) {
      return;
    }

    setPending(true);
    try {
      await signIn('password', {
        email: values.email.trim(),
        password: values.password,
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
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          label={t('email')}
          type="email"
          autoComplete="email"
          required
          {...field('email')}
        />
        <PasswordField
          label={t('password')}
          autoComplete="current-password"
          required
          {...field('password')}
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
