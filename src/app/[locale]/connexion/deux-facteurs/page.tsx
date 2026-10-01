'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { useRouter } from '@/i18n/navigation';
import { AuthCard, SubmitButton } from '@/components/auth/form';
import { AuthGateLoading } from '@/components/auth/auth-gate';
import { FormError, TextField } from '@/components/ui/field';
import { errorCode } from '@/lib/account-errors';
import { vocabulary } from '@/i18n/vocabulary';
import { Button } from '@/components/ui/button';

// SECOND-FACTOR ENTRY AFTER SIGN-IN (accounts workstream, 2FA).
//
// Sign-in by password or by e-mail code opened a session; until that
// session has presented a TOTP code (or a backup code), the server refuses
// it everything (convex/lib/rbac.ts). The private-area guard sends the user
// back here with the requested page in the `suite` parameter.

const ERRORS = ['INVALID_CODE', 'REPLAYED', 'NOT_ENABLED', 'RATE_LIMITED'];

// Return path: an INTERNAL path only (no `//host`), otherwise this
// parameter would become an open redirect.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/espace-membre';
  }
  return raw;
}

export default function TwoFactorChallengePage() {
  const t = useTranslations('twoFactor');
  const { isAuthenticated, isLoading } = useConvexAuth();
  const session = useQuery(
    api.accounts.sessionState,
    isAuthenticated ? {} : 'skip',
  );
  const verify = useAction(api.twoFactor.verify);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [next, setNext] = useState('/espace-membre');
  const [mode, setMode] = useState<'app' | 'backup'>('app');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get('suite')));
  }, []);

  const state = session?.state;
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/connexion');
    else if (state === 'active') router.replace(next);
    else if (state === 'enrollment_required') {
      router.replace('/espace-membre/securite');
    } else if (state === 'suspended') {
      void signOut().finally(() => router.replace('/connexion?motif=suspendu'));
    } else if (state === 'deleting') {
      void signOut().finally(() => router.replace('/'));
    }
  }, [isLoading, isAuthenticated, state, next, router, signOut]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (code.trim().length < 6) {
      setError(vocabulary(t, 'err_', 'INVALID_CODE'));
      return;
    }
    setPending(true);
    try {
      const res = await verify({ code: code.trim() });
      if (res.ok) {
        router.replace(next);
        return;
      }
      setError(vocabulary(t, 'err_', res.reason, t('errGeneric')));
    } catch (err) {
      const c = errorCode(err, ERRORS);
      setError(c ? vocabulary(t, 'err_', c) : t('errGeneric'));
    } finally {
      setPending(false);
    }
  }

  if (state !== 'second_factor_required') {
    return <AuthGateLoading className="max-w-md" />;
  }

  return (
    <AuthCard title={t('challengeTitle')} subtitle={t('challengeSubtitle')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mode === 'app' ? (
          <TextField
            key="app"
            label={t('codeLabel')}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            controlClassName="font-mono text-lg tracking-[0.3em]"
            required
          />
        ) : (
          <TextField
            key="backup"
            label={t('backupLabel')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            controlClassName="font-mono tracking-[0.15em]"
            required
          />
        )}
        <FormError>{error}</FormError>
        <SubmitButton pending={pending}>{t('submit')}</SubmitButton>
      </form>

      <div className="mt-5 flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="link"
          size="inline"
          onClick={() => {
            setMode(mode === 'app' ? 'backup' : 'app');
            setCode('');
            setError(null);
          }}
          className="min-h-11"
        >
          {mode === 'app' ? t('useBackup') : t('useApp')}
        </Button>
        <Button
          type="button"
          variant="link-muted"
          size="inline"
          onClick={() =>
            void signOut().finally(() => router.replace('/connexion'))
          }
          className="min-h-11"
        >
          {t('signOut')}
        </Button>
      </div>
      <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-muted">
        {t('lostDevice')}
      </p>
    </AuthCard>
  );
}
