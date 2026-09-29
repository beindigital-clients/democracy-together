'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField, useFormFields } from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';
import { isSendLimited } from '@/lib/auth-errors';
import { isAccountSuspended } from '@/lib/account-errors';
import { isEmail } from '@/lib/validation';
import {
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
} from '@convex/lib/passwordPolicy';

// ONE QUESTION PER SCREEN: the address, then the code, then the new
// password. The code and the new password used to share one form, which
// asked for everything before checking anything: a mistyped code only came
// to light after choosing — twice — a new password.
//
// The code step asks the server whether the code is right
// (`passwordReset.checkCode`) WITHOUT consuming it; the password step then
// hands both to Convex Auth's `reset-verification`, as before. Why that check
// opens neither extra guesses nor an existence oracle: convex/passwordReset.ts.
type Step = 'request' | 'code' | 'reset';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const tAccounts = useTranslations('accounts');
  const { signIn } = useAuthActions();
  const checkCode = useMutation(api.passwordReset.checkCode);
  const redirectAfterAuth = useRedirectAfterAuth();
  const [step, setStep] = useState<Step>('request');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { values, field, setValue, validate } = useFormFields({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  });
  const email = values.email.trim();

  // A screen opens without the previous one's messages.
  function goTo(next: Step, message: string | null = null) {
    setStep(next);
    setError(message);
    setNotice(null);
  }

  async function onRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!validate({ email: (v) => (isEmail(v) ? null : t('errEmail')) })) {
      return;
    }
    setPending(true);
    try {
      await signIn('password', { email, flow: 'reset' });
      goTo('code');
    } catch (err) {
      if (isSendLimited(err)) {
        setError(t('errorSendLimit'));
      } else {
        // ANTI-ENUMERATION, as with sign-in by code: an address
        // without a password account (`InvalidAccountId`) must not be
        // distinguishable from a known address. The code step's subtitle
        // says "if an account with a password exists" and points to
        // sign-in by code, the only path for an invited member.
        goTo('code');
      }
    } finally {
      setPending(false);
    }
  }

  // Code resend from the code step (auth A-5): same anti-enumeration as
  // `onRequest`, same dedicated cap message (A-4).
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

  // A typo in the address, and no code will ever come: back to the first
  // screen, address kept. The code typed so far was for the old one.
  function onChangeEmail() {
    setValue('code', '');
    goTo('request');
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
      const verdict = await checkCode({ email, code: values.code });
      if (verdict === 'valid') {
        goTo('reset');
      } else {
        // A refused code is cleared. Left in place, the six boxes stayed
        // full and focusing them put the caret on the LAST one: typing the
        // next code only replaced its last digit.
        setValue('code', '');
        setError(
          verdict === 'tooManyAttempts'
            ? t('errorTooManyAttempts')
            : t('errorCode'),
        );
      }
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Same policy as the server (convex/lib/passwordPolicy.ts), applied
    // HERE so we can SAY which of the two rules fails. The server refusal does
    // not allow it: Convex Auth's /api/auth route flattens `ConvexError.data`
    // into HTTP status text, and the browser only gets a bare error.
    // (Observed in E2E, not inferred.) The server still refuses: this check
    // relaxes nothing, it explains — and points at the field itself.
    if (
      !validate({
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
      setPending(false);
      if (isAccountSuspended(err)) {
        // Refused AFTER the code is verified (convex/lib/signIn.ts): this
        // only informs the code's holder.
        setError(tAccounts('suspendedSignIn'));
        return;
      }
      // The code was right a moment ago: it has expired since, a resend has
      // replaced it, or the failure budget ran out. The reason does not cross
      // /api/auth, and all three lead to the same place — the code step,
      // where a new one can be requested. The new password stays typed.
      setValue('code', '');
      goTo('code', t('errorCodeNoLongerValid'));
    }
  }

  if (step === 'reset') {
    return (
      <AuthCard
        title={t('resetTitle')}
        subtitle={t('resetSubtitle', { email })}
      >
        <form onSubmit={onReset} noValidate className="space-y-5">
          {/* The address the new password belongs to, for password managers:
              without it they file the password under no account. */}
          <input
            type="email"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <PasswordField
            label={t('newPassword')}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            autoFocus
            {...field('newPassword')}
          />
          <PasswordField
            label={t('confirmPassword')}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            {...field('confirmPassword')}
          />
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('resetCta')}</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  if (step === 'code') {
    return (
      <AuthCard
        title={t('resetCodeTitle')}
        subtitle={t('resetCodeSubtitle', { email })}
      >
        <form onSubmit={onCode} noValidate className="space-y-5">
          <OtpField {...field('code')} />
          {notice ? (
            <p role="status" className="text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>{t('resetCodeCta')}</SubmitButton>
        </form>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <button
            type="button"
            onClick={onResend}
            disabled={pending}
            className="text-sm text-accent-text hover:underline disabled:opacity-50"
          >
            {t('resendCode')}
          </button>
          <button
            type="button"
            onClick={onChangeEmail}
            disabled={pending}
            className="text-sm text-accent-text hover:underline disabled:opacity-50"
          >
            {t('changeEmail')}
          </button>
        </div>
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
