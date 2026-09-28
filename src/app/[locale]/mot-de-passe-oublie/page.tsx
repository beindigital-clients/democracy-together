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
        // ANTI-ÉNUMÉRATION, comme sur la connexion par code : une adresse
        // sans compte mot de passe (`InvalidAccountId`) ne doit pas se
        // distinguer d'une adresse connue. Le sous-titre de l'étape suivante
        // dit « si un compte avec mot de passe existe » et renvoie vers la
        // connexion par code, seul chemin d'un membre invité.
        setStep('reset');
      }
    } finally {
      setPending(false);
    }
  }

  // Renvoi du code depuis l'étape « nouveau mot de passe » (auth A-5) : même
  // anti-énumération que `onRequest`, même message dédié au plafond (A-4).
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
    // Même politique que le serveur (convex/lib/passwordPolicy.ts), appliquée
    // ICI pour pouvoir DIRE laquelle des deux règles casse. Le refus serveur ne
    // le permet pas : la route /api/auth de Convex Auth aplatit `ConvexError.data`
    // en texte de statut HTTP, et le navigateur ne reçoit qu'une erreur nue —
    // affichée « Code invalide ou expiré », qui désigne le mauvais champ.
    // (Constaté en E2E, pas déduit.) Le serveur refuse toujours : ce contrôle
    // ne relâche rien, il explique — et désigne maintenant le champ lui-même.
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
