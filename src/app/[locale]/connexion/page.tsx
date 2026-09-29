'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { isTooManyAttempts } from '@/lib/auth-errors';
import { isAccountSuspended } from '@/lib/account-errors';
import { isEmail } from '@/lib/validation';
import { normalizeEmail } from '@convex/lib/onboarding';

export default function ConnexionPage() {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const tAccounts = useTranslations('accounts');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { values, field, validate } = useFormFields({
    email: '',
    password: '',
  });

  // Session closed because the account was SUSPENDED (accounts workstream):
  // the private-area guard signs the user out and sends them here with the
  // reason. Read on mount rather than via `useSearchParams`, which would
  // force a Suspense boundary on a prerendered page.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get('motif') === 'suspendu'
    ) {
      setError(tAccounts('suspendedSignIn'));
    }
  }, [tAccounts]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // What can be checked HERE goes to the field: a malformed address, an
    // empty password. The server's REFUSAL stays global — saying which of the
    // two is wrong would reveal whether the account exists.
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
        // As accounts store it (lowercase): an address typed with a
        // capital letter found no account.
        email: normalizeEmail(values.email),
        password: values.password,
        flow: 'signIn',
      });
      redirectAfterAuth();
    } catch (err) {
      // Convex Auth's anti-brute-force lock ALSO refused the correct
      // password, with the same "incorrect": the user kept correcting a password
      // that was right (measured on 27/09). The server's message
      // passes through `/api/auth` unchanged: we read it.
      // SUSPENDED account: the refusal only comes AFTER the password is
      // verified (convex/lib/signIn.ts), so it only informs its
      // holder — we can say it plainly.
      setError(
        isAccountSuspended(err)
          ? tAccounts('suspendedSignIn')
          : isTooManyAttempts(err)
            ? t('errorTooManyAttempts')
            : t('errorSignIn'),
      );
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
        <div className="text-end">
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
        <Link
          href="/adhesion"
          className="text-accent-text underline underline-offset-2"
        >
          {tNav('join')}
        </Link>
      </p>
    </AuthCard>
  );
}
