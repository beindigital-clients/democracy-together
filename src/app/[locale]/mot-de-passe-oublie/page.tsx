'use client';

import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRedirectAfterAuth } from '@/components/auth/redirect-after-auth';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, TextField } from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';
import { formField } from '@/lib/validation';
import {
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
} from '@convex/lib/passwordPolicy';

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
    // Même politique que le serveur (convex/lib/passwordPolicy.ts), appliquée
    // ICI pour pouvoir DIRE laquelle des deux règles casse. Le refus serveur ne
    // le permet pas : la route /api/auth de Convex Auth aplatit `ConvexError.data`
    // en texte de statut HTTP, et le navigateur ne reçoit qu'une erreur nue —
    // affichée « Code invalide ou expiré », qui désigne le mauvais champ.
    // (Constaté en E2E, pas déduit.) Le serveur refuse toujours : ce contrôle
    // ne relâche rien, il explique.
    const refus = passwordRefusal(newPassword);
    if (refus) {
      setError(
        refus === 'PASSWORD_TOO_SHORT'
          ? t('errorPasswordTooShort', { min: PASSWORD_MIN_LENGTH })
          : t('errorPasswordTooCommon'),
      );
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
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <PasswordField
            label={t('confirmPassword')}
            name="confirmPassword"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
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
        <TextField
          label={t('email')}
          name="email"
          type="email"
          autoComplete="email"
          required
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
