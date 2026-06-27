'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, Field, FormError, SubmitButton } from '@/components/auth/form';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';

export default function InscriptionPage() {
  const t = useTranslations('auth');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const mail = String(fd.get('email'));
    const password = String(fd.get('password'));
    if (password !== String(fd.get('confirmPassword'))) {
      setError(t('errorMismatch'));
      return;
    }
    setPending(true);
    try {
      await signIn('password', { email: mail, password, flow: 'signUp' });
      setEmail(mail);
      setStep('verify');
    } catch {
      setError(t('errorSignUp'));
    } finally {
      setPending(false);
    }
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signIn('password', { email, code, flow: 'email-verification' });
      redirectAfterAuth();
    } catch {
      setError(t('errorCode'));
      setPending(false);
    }
  }

  if (step === 'verify') {
    return (
      <AuthCard title={t('verifyTitle')} subtitle={t('verifySubtitle', { email })}>
        <form onSubmit={onVerify} className="space-y-5">
          <OtpField value={code} onChange={setCode} />
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('verifyCta')}</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('signUpTitle')} subtitle={t('signUpSubtitle')}>
      <form onSubmit={onSignUp} className="space-y-4">
        <Field label={t('email')} name="email" type="email" autoComplete="email" required />
        <PasswordField
          label={t('password')}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PasswordField
          label={t('confirmPassword')}
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FormError>{error}</FormError>
        <SubmitButton pending={pending}>{t('signUpCta')}</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        {t('haveAccount')}{' '}
        <Link href="/connexion" className="text-accent-text hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </AuthCard>
  );
}
