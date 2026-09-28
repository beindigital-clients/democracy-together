'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';
import { isSendLimited, isTooManyAttempts } from '@/lib/auth-errors';
import { isEmail } from '@/lib/validation';
import {
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
} from '@convex/lib/passwordPolicy';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const { signIn } = useAuthActions();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { values, field, validate } = useFormFields({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  });
  const email = values.email.trim();

  async function onRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!validate({ email: (v) => (isEmail(v) ? null : t('errEmail')) })) {
      return;
    }
    setPending(true);
    try {
      await signIn('password', { email, flow: 'reset' });
      setStep('reset');
    } catch (err) {
      if (isSendLimited(err)) {
        setError(t('errorSendLimit'));
      } else {
        // ANTI-ENUMERATION, as with sign-in by code: an address
        // without a password account (`InvalidAccountId`) must not be
        // distinguishable from a known address. The next step's subtitle
        // says "if an account with a password exists" and points to
        // sign-in by code, the only path for an invited member.
        setStep('reset');
      }
    } finally {
      setPending(false);
    }
  }

  // Code resend from the "new password" step (auth A-5): same
  // anti-enumeration as `onRequest`, same dedicated cap message (A-4).
  async function onResend() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await signIn('password', { email, flow: 'reset' });
      setNotice(t('resendDone'));
    } catch (err) {
      if (isSendLimited(err)) setError(t('errorSendLimit'));
      else setNotice(t('resendDone'));
    } finally {
      setPending(false);
    }
  }

  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // Same policy as the server (convex/lib/passwordPolicy.ts), applied
    // HERE so we can SAY which of the two rules fails. The server refusal does
    // not allow it: Convex Auth's /api/auth route flattens `ConvexError.data`
    // into HTTP status text, and the browser only gets a bare error —
    // shown as "Code invalide ou expiré", which points at the wrong field.
    // (Observed in E2E, not inferred.) The server still refuses: this check
    // relaxes nothing, it explains — and now points at the field itself.
    if (
      !validate({
        code: (v) => (v.length === 6 ? null : t('errCode')),
        newPassword: (v) => {
          const refus = passwordRefusal(v);
          if (!refus) return null;
          return refus === 'PASSWORD_TOO_SHORT'
            ? t('errorPasswordTooShort', { min: PASSWORD_MIN_LENGTH })
            : t('errorPasswordTooCommon');
        },
        confirmPassword: (v) =>
          v === values.newPassword ? null : t('errorMismatch'),
      })
    ) {
      return;
    }

    setPending(true);
    try {
      await signIn('password', {
        email,
        code: values.code,
        newPassword: values.newPassword,
        flow: 'reset-verification',
      });
      redirectAfterAuth();
    } catch (err) {
      setError(
        isTooManyAttempts(err) ? t('errorTooManyAttempts') : t('errorCode'),
      );
      setPending(false);
    }
  }

  if (step === 'reset') {
    return (
      <AuthCard title={t('resetTitle')} subtitle={t('resetSubtitle')}>
        <form onSubmit={onReset} noValidate className="space-y-5">
          <OtpField {...field('code')} />
          <PasswordField
            label={t('newPassword')}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            {...field('newPassword')}
          />
          <PasswordField
            label={t('confirmPassword')}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            {...field('confirmPassword')}
          />
          {notice ? (
            <p role="status" className="text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('resetCta')}</SubmitButton>
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
    <AuthCard title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
      <form onSubmit={onRequest} noValidate className="space-y-4">
        <TextField
          label={t('email')}
          type="email"
          autoComplete="email"
          required
          {...field('email')}
        />
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
