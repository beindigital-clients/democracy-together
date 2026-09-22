'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { OtpField } from '@/components/auth/otp-field';
import { isEmail } from '@/lib/validation';

export default function OtpSignInPage() {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // L'adresse survit au passage à l'étape du code — et à un échec d'envoi : la
  // retaper après un refus serveur était la première chose à éviter.
  const { values, field, validate } = useFormFields({ email: '', code: '' });
  const email = values.email.trim();

  async function onEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!validate({ email: (v) => (isEmail(v) ? null : t('errEmail')) })) {
      return;
    }
    setPending(true);
    try {
      await signIn('otp-signin', { email });
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
    if (!validate({ code: (v) => (v.length === 6 ? null : t('errCode')) })) {
      return;
    }
    setPending(true);
    try {
      await signIn('otp-signin', { email, code: values.code });
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
        <form onSubmit={onCode} noValidate className="space-y-5">
          <OtpField {...field('code')} />
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('otpVerifyCta')}</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('otpTitle')} subtitle={t('otpSubtitle')}>
      <form onSubmit={onEmail} noValidate className="space-y-4">
        <TextField
          label={t('email')}
          type="email"
          autoComplete="email"
          required
          {...field('email')}
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
