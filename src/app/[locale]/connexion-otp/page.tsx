'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { OtpField } from '@/components/auth/otp-field';
import { isSendLimited, isTooManyAttempts } from '@/lib/auth-errors';
import { isAccountSuspended } from '@/lib/account-errors';
import { isEmail } from '@/lib/validation';

export default function OtpSignInPage() {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const tAccounts = useTranslations('accounts');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The address survives moving to the code step — and a failed send:
  // retyping it after a server refusal was the first thing to avoid.
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
    } catch (err) {
      if (isSendLimited(err)) {
        setError(t('errorSendLimit'));
      } else {
        // ANTI-ENUMERATION. An unknown address made the server throw
        // (`NO_SELF_SIGNUP`) and the screen said "an error occurred"
        // where a known address moved on to the code step: the screen thus
        // revealed who has an account (measured on 27/09). We move to the code
        // step in both cases; the subtitle says "if an account exists".
        setStep('code');
      }
    } finally {
      setPending(false);
    }
  }

  // CODE RESEND, from the code step (auth A-5). Without this button,
  // a user who received nothing reloaded the page and retyped their
  // address. Same anti-enumeration rule as `onEmail`: an unknown address
  // gets the same "if an account exists"; only the send cap
  // (`RATE_LIMITED`, convex/otp.ts) has its own message — it used to say
  // "try again" where one has to wait (A-4).
  async function onResend() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await signIn('otp-signin', { email });
      setNotice(t('resendDone'));
    } catch (err) {
      if (isSendLimited(err)) setError(t('errorSendLimit'));
      else setNotice(t('resendDone'));
    } finally {
      setPending(false);
    }
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!validate({ code: (v) => (v.length === 6 ? null : t('errCode')) })) {
      return;
    }
    setPending(true);
    try {
      await signIn('otp-signin', { email, code: values.code });
      redirectAfterAuth();
    } catch (err) {
      // Suspended account: refused AFTER the code is verified, so nothing is
      // revealed to someone who does not own it (convex/lib/signIn.ts).
      setError(
        isAccountSuspended(err)
          ? tAccounts('suspendedSignIn')
          : isTooManyAttempts(err)
            ? t('errorTooManyAttempts')
            : t('errorCode'),
      );
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
          {notice ? (
            <p role="status" className="text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('otpVerifyCta')}</SubmitButton>
        </form>
        <button
          type="button"
          onClick={onResend}
          disabled={pending}
          className="mt-4 text-sm text-accent-text hover:underline disabled:opacity-50"
        >
          {t('resendCode')}
        </button>
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
