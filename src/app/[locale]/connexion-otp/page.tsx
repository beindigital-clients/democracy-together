'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import {
  AuthCard,
  Field,
  FormError,
  SubmitButton,
} from '@/components/auth/form';
import { OtpField } from '@/components/auth/otp-field';
import { formField } from '@/lib/validation';

export default function OtpSignInPage() {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const mail = formField(new FormData(e.currentTarget), 'email');
    try {
      await signIn('otp-signin', { email: mail });
      setEmail(mail);
      setStep('code');
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signIn('otp-signin', { email, code });
      redirectAfterAuth();
    } catch {
      setError(t('errorCode'));
      setPending(false);
    }
  }

  if (step === 'code') {
    return (
      <AuthCard
        title={t('otpVerifyTitle')}
        subtitle={t('otpVerifySubtitle', { email })}
      >
        <form onSubmit={onCode} className="space-y-5">
          <OtpField value={code} onChange={setCode} />
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('otpVerifyCta')}</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('otpTitle')} subtitle={t('otpSubtitle')}>
      <form onSubmit={onEmail} className="space-y-4">
        <Field
          label={t('email')}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <FormError>{error}</FormError>
        <SubmitButton pending={pending}>{t('otpCta')}</SubmitButton>
      </form>
      <Link
        href="/connexion"
        className="mt-6 block text-sm text-accent-text hover:underline"
      >
        {t('backToSignIn')}
      </Link>
      <p className="mt-3 text-sm text-ink-soft">
        {t('noAccount')}{' '}
        <Link href="/adhesion" className="text-accent-text hover:underline">
          {tNav('join')}
        </Link>
      </p>
    </AuthCard>
  );
}
