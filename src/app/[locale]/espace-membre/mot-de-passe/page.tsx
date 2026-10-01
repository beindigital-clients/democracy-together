'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useAction, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { SubmitButton } from '@/components/auth/form';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
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
import { Button } from '@/components/ui/button';

// SETTING (OR CHANGING) ONE'S PASSWORD, SIGNED IN — R-05 / auth A-3.
//
// An invited member has no password: their account is created by a
// membership approval or an invitation, and the invitation e-mail promises
// them "vous pourrez en définir un depuis votre espace membre". This screen
// did not exist (measured on 27/09); "forgot password" could do nothing for
// them, since `flow: 'reset'` requires an EXISTING password account
// (`InvalidAccountId` otherwise, see TESTING.md "Mot de passe des comptes de
// test").
//
// THE ONLY OPEN PATH is the one `provisionPassword` follows in E2E:
// `signIn('password', { flow: 'signUp' })` on the SIGNED-IN account's address.
// `createAccount` then goes through the `createOrUpdateUser` callback
// (convex/auth.ts -> lib/signIn.ts), which returns the existing account's
// id — the new sign-in method is linked to it, role and profile intact (test
// in convex/auth-callback.test.ts). Since the provider is configured with
// `verify`, sign-up does not open a session: it sends a code, which is then
// presented with `flow: 'email-verification'`.
//
// CHANGING an already-set password goes through the other door: `signUp` on
// an existing password account answers "Account … already exists" (Convex
// Auth checks the secret and refuses if it differs). We then switch, without
// asking anything more, to `flow: 'reset'` then `reset-verification` with the
// new password — same six-digit code, same screen. The user only sees a
// single flow: password, code, confirmation.
//
// The address comes from the SIGNED-IN ACCOUNT (`users.current`), never from
// a field: one can only set a password on one's own account, and the code is
// sent to the account's address — that is what proves one holds it.
//
// WHY THE DIRECT ACTION and not `signIn` from `useAuthActions` (measured on
// 27/09, auth-mot-de-passe spec): when the step does not open a session —
// `signUp` with `verify`, `reset`, or a wrong code — `auth:signIn` returns
// `{ tokens: null }`, and Convex Auth's Next.js client takes that "null"
// as a sign-out: it CLEARS the session cookies (`/api/auth` proxy,
// "No tokens returned, clearing auth cookies"). The member ended up on
// "Se connecter" at the very moment they were asking for their code. The
// action called directly does not touch the cookies. Once the password is set
// and verified, we sign back in WITH it — via `signIn` this time, which renews
// the session: this is also proof that the password works, and, in `reset`
// mode, the only session that survives (the others are invalidated).
type Mode = 'verify' | 'reset';

// Convex Auth's refusal when a password account already exists for this
// address (`createAccountFromCredentials`: "Account <id> already exists").
// The raw message passes through `/api/auth` (`{ error: error.message }`)
// like the other refusals read in `@/lib/auth-errors`.
function isAccountAlreadyExists(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}

// The three steps (password, code, done) share the member-area header —
// "Mon mot de passe" — and change only the card below it: the page stays the
// same place while the step advances.
function PasswordPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useTranslations('auth');
  return (
    <>
      <MemberPageHeader title={t('passwordTitle')} />
      <MemberPageBody className="max-w-xl">
        <section
          aria-labelledby="mdp-etape"
          className="rounded-md border border-line bg-surface p-5 shadow-card sm:p-7"
        >
          <h2 id="mdp-etape" className="font-display text-2xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-2 wrap-anywhere leading-relaxed text-ink-soft">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </section>
      </MemberPageBody>
    </>
  );
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

  // Requests the code: `signUp` first, `reset` if a password already exists.
  // Returns the chosen mode, so that resending the code takes the same path.
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
    // Same policy as the server (convex/lib/passwordPolicy.ts), applied
    // HERE to say which rule fails — the server refusal arrives bare
    // via /api/auth (see mot-de-passe-oublie/page.tsx). The server still
    // refuses; this check opens nothing, it explains.
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
      // Wrong code: `{ tokens: null }`, no error — we say so, session intact.
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
      // Sign back in with the password that was just set: the cookies
      // follow the new session, and the password is proven.
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
      <PasswordPanel title={t('passwordDoneTitle')}>
        <StatusMessage as="p" className="wrap-anywhere text-ink-soft">
          {t('passwordDoneBody')}
        </StatusMessage>
        <Link
          href="/espace-membre"
          className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
        >
          <ArrowBack /> {t('passwordBack')}
        </Link>
      </PasswordPanel>
    );
  }

  if (step === 'code') {
    return (
      <PasswordPanel
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
        <Button
          type="button"
          variant="link"
          size="inline"
          onClick={onResend}
          disabled={pending}
          className="mt-4"
        >
          {t('resendCode')}
        </Button>
      </PasswordPanel>
    );
  }

  return (
    <PasswordPanel
      title={t('passwordNewTitle')}
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
    </PasswordPanel>
  );
}

function PasswordScreen() {
  const t = useTranslations('auth');
  const me = useQuery(api.users.current);
  if (me === undefined) return <AuthGateLoading />;
  // An account without an address cannot receive any code: we say so rather
  // than render a form that will fail. (`email` is optional in the database.)
  if (!me?.email) {
    return (
      <PasswordPanel title={t('passwordNewTitle')}>
        <FormError>{t('passwordNoEmail')}</FormError>
      </PasswordPanel>
    );
  }
  return <PasswordForm email={me.email} />;
}

export default function MotDePassePage() {
  return (
    <AuthGate>
      <PasswordScreen />
    </AuthGate>
  );
}
