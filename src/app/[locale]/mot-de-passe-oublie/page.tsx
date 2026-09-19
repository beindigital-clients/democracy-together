'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, Field, FormError, SubmitButton } from '@/components/auth/form';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';
import { formField } from '@/lib/validation';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const mail = formField(new FormData(e.currentTarget), 'email');
    try {
      await signIn('password', { email: mail, flow: 'reset' });
      setEmail(mail);
      setStep('reset');
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const newPassword = formField(fd, 'newPassword');
    if (newPassword !== formField(fd, 'confirmPassword')) {
      setError(t('errorMismatch'));
      return;
    }
    setPending(true);
    try {
      await signIn('password', {
        email,
        code,
        newPassword,
        flow: 'reset-verification',
      });
      redirectAfterAuth();
    } catch {
      setError(t('errorCode'));
      setPending(false);
    }
  }

  if (step === 'reset') {
    return (
      <AuthCard title={t('resetTitle')} subtitle={t('resetSubtitle')}>
        <form onSubmit={onReset} className="space-y-5">
          <OtpField value={code} onChange={setCode} />
          <PasswordField
            label={t('newPassword')}
            name="newPassword"
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
          <SubmitButton pending={pending}>{t('resetCta')}</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
      <form onSubmit={onRequest} className="space-y-4">
        <Field label={t('email')} name="email" type="email" autoComplete="email" required />
        <FormError>{error}</FormError>
        <SubmitButton pending={pending}>{t('forgotCta')}</SubmitButton>
      </form>
      <Link
        href="/connexion"
        className="mt-6 block text-sm text-accent-text hover:underline"
      >
        {t('backToSignIn')}
      </Link>
    </AuthCard>
  );
}
