'use client';

import { useState, type FormEvent } from 'react';
import { useAction, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { FormError, useFormFields } from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';
import { ArrowBack } from '@/components/ui/arrow';
import { isSendLimited, isTooManyAttempts } from '@/lib/auth-errors';
import {
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
} from '@convex/lib/passwordPolicy';
import { StatusMessage } from '@/components/a11y/status-message';

// DÉFINIR (OU CHANGER) SON MOT DE PASSE, CONNECTÉ — R-05 / auth A-3.
//
// Un membre invité n'a pas de mot de passe : son compte naît d'une validation
// d'adhésion ou d'une invitation, et l'e-mail d'invitation lui promet « vous
// pourrez en définir un depuis votre espace membre ». Cet écran n'existait
// pas (mesuré le 27/09) ; « mot de passe oublié » ne pouvait rien pour lui,
// puisque `flow: 'reset'` exige un compte mot de passe EXISTANT
// (`InvalidAccountId` sinon, cf. TESTING.md « Mot de passe des comptes de
// test »).
//
// LE SEUL CHEMIN OUVERT est celui que suit `provisionPassword` en E2E :
// `signIn('password', { flow: 'signUp' })` sur l'adresse du compte CONNECTÉ.
// `createAccount` passe alors par le callback `createOrUpdateUser`
// (convex/auth.ts -> lib/signIn.ts), qui rend l'identifiant du compte existant
// — le nouveau moyen de connexion y est relié, rôle et profil intacts (test
// dans convex/auth-callback.test.ts). Le provider étant configuré avec
// `verify`, l'inscription n'ouvre pas de session : elle envoie un code, qu'on
// présente ensuite en `flow: 'email-verification'`.
//
// CHANGER un mot de passe déjà posé passe par l'autre porte : `signUp` sur un
// compte mot de passe existant répond « Account … already exists » (Convex
// Auth vérifie le secret et refuse s'il diffère). On bascule alors, sans rien
// demander de plus, sur `flow: 'reset'` puis `reset-verification` avec le
// nouveau mot de passe — même code à six chiffres, même écran. L'utilisateur
// ne voit qu'un seul parcours : mot de passe, code, confirmation.
//
// L'adresse vient du COMPTE CONNECTÉ (`users.current`), jamais d'un champ : on
// ne pose un mot de passe que sur son propre compte, et le code part à
// l'adresse du compte — c'est ce qui prouve qu'on la détient.
//
// POURQUOI L'ACTION DIRECTE et non `signIn` de `useAuthActions` (mesuré le
// 27/09, spec auth-mot-de-passe) : quand l'étape n'ouvre pas de session —
// `signUp` avec `verify`, `reset`, ou un code faux — `auth:signIn` répond
// `{ tokens: null }`, et le client Next.js de Convex Auth prend ce « null »
// pour une déconnexion : il EFFACE les cookies de session (proxy `/api/auth`,
// « No tokens returned, clearing auth cookies »). Le membre se retrouvait sur
// « Se connecter » au moment même où il demandait son code. L'action appelée
// directement ne touche pas aux cookies. Une fois le mot de passe posé et
// vérifié, on se reconnecte AVEC — par `signIn` cette fois, qui renouvelle la
// session : c'est aussi la preuve que le mot de passe fonctionne, et, en mode
// `reset`, la seule session qui survit (les autres sont invalidées).
type Mode = 'verify' | 'reset';

// Le refus de Convex Auth quand un compte mot de passe existe déjà pour cette
// adresse (`createAccountFromCredentials` : « Account <id> already exists »).
// Le message brut traverse `/api/auth` (`{ error: error.message }`) comme les
// autres refus lus dans `@/lib/auth-errors`.
function isAccountAlreadyExists(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}

function PasswordForm({ email }: { email: string }) {
  const t = useTranslations('auth');
  const { signIn } = useAuthActions();
  const authSignIn = useAction(api.auth.signIn);
  const [step, setStep] = useState<'password' | 'code' | 'done'>('password');
  const [mode, setMode] = useState<Mode>('verify');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { values, field, validate } = useFormFields({
    newPassword: '',
    confirmPassword: '',
    code: '',
  });

  // Demande le code : `signUp` d'abord, `reset` si un mot de passe existe déjà.
  // Rend le mode retenu, pour que le renvoi de code reprenne le même chemin.
  async function requestCode(): Promise<Mode> {
    try {
      await authSignIn({
        provider: 'password',
        params: { email, password: values.newPassword, flow: 'signUp' },
      });
      return 'verify';
    } catch (err) {
      if (!isAccountAlreadyExists(err)) throw err;
      await authSignIn({
        provider: 'password',
        params: { email, flow: 'reset' },
      });
      return 'reset';
    }
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Même politique que le serveur (convex/lib/passwordPolicy.ts), appliquée
    // ICI pour dire laquelle des règles casse — le refus serveur arrive nu
    // par /api/auth (cf. mot-de-passe-oublie/page.tsx). Le serveur refuse
    // toujours ; ce contrôle n'ouvre rien, il explique.
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
      setMode(await requestCode());
      setStep('code');
    } catch (err) {
      setError(isSendLimited(err) ? t('errorSendLimit') : t('errorGeneric'));
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      setMode(await requestCode());
      setNotice(t('resendDone'));
    } catch (err) {
      setError(isSendLimited(err) ? t('errorSendLimit') : t('errorGeneric'));
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
      // Code faux : `{ tokens: null }`, sans erreur — on le dit, session intacte.
      const verified = await authSignIn({
        provider: 'password',
        params:
          mode === 'reset'
            ? {
                email,
                code: values.code,
                newPassword: values.newPassword,
                flow: 'reset-verification',
              }
            : { email, code: values.code, flow: 'email-verification' },
      });
      if (!verified || verified.tokens === null)
        throw new Error('INVALID_CODE');
      // Reconnexion par le mot de passe qui vient d'être posé : les cookies
      // suivent la nouvelle session, et le mot de passe est prouvé.
      await signIn('password', {
        email,
        password: values.newPassword,
        flow: 'signIn',
      });
      setStep('done');
    } catch (err) {
      setError(
        isTooManyAttempts(err) ? t('errorTooManyAttempts') : t('errorCode'),
      );
    } finally {
      setPending(false);
    }
  }

  if (step === 'done') {
    return (
      <AuthCard title={t('passwordDoneTitle')}>
        <StatusMessage as="p" className="wrap-anywhere text-ink-soft">
          {t('passwordDoneBody')}
        </StatusMessage>
        <Link
          href="/espace-membre"
          className="mt-6 inline-block text-sm font-medium text-accent-text hover:underline"
        >
          <ArrowBack /> {t('passwordBack')}
        </Link>
      </AuthCard>
    );
  }

  if (step === 'code') {
    return (
      <AuthCard
        title={t('passwordVerifyTitle')}
        subtitle={t('passwordVerifySubtitle', { email })}
      >
        <form onSubmit={onCode} noValidate className="space-y-5">
          <OtpField {...field('code')} />
          {notice ? (
            <p role="status" className="text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}
          <FormError>{error}</FormError>
          <SubmitButton pending={pending}>
            {t('passwordVerifyCta')}
          </SubmitButton>
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
    <AuthCard
      title={t('passwordTitle')}
      subtitle={t('passwordSubtitle', { email })}
    >
      <form onSubmit={onPassword} noValidate className="space-y-5">
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
        <FormError>{error}</FormError>
        <SubmitButton pending={pending}>{t('passwordCta')}</SubmitButton>
      </form>
      <Link
        href="/espace-membre"
        className="mt-6 inline-block text-sm text-accent-text hover:underline"
      >
        <ArrowBack /> {t('passwordBack')}
      </Link>
    </AuthCard>
  );
}

function PasswordScreen() {
  const t = useTranslations('auth');
  const me = useQuery(api.users.current);
  if (me === undefined) return <AuthGateLoading className="max-w-md" />;
  // Un compte sans adresse ne peut recevoir aucun code : on le dit plutôt que
  // de rendre un formulaire qui échouera. (`email` est facultatif en base.)
  if (!me?.email) {
    return (
      <AuthCard title={t('passwordTitle')}>
        <FormError>{t('passwordNoEmail')}</FormError>
        <Link
          href="/espace-membre"
          className="mt-6 inline-block text-sm text-accent-text hover:underline"
        >
          <ArrowBack /> {t('passwordBack')}
        </Link>
      </AuthCard>
    );
  }
  return <PasswordForm email={me.email} />;
}

export default function MotDePassePage() {
  return (
    <AuthGate className="max-w-md">
      <PasswordScreen />
    </AuthGate>
  );
}
