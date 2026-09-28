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

// SAISIE DU SECOND FACTEUR APRÈS CONNEXION (chantier comptes, 2FA).
//
// La connexion par mot de passe ou par code e-mail a ouvert une session ; tant
// que cette session n'a pas présenté un code TOTP (ou un code de secours), le
// serveur lui refuse tout (convex/lib/rbac.ts). La garde des espaces privés
// renvoie ici avec la page demandée en paramètre `suite`.

const ERRORS = ['INVALID_CODE', 'REPLAYED', 'NOT_ENABLED', 'RATE_LIMITED'];

// Chemin de retour : un chemin INTERNE seulement (pas de `//hote`), sinon ce
// paramètre deviendrait une redirection ouverte.
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
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'app' ? 'backup' : 'app');
            setCode('');
            setError(null);
          }}
          className="min-h-11 text-sm text-accent-text hover:underline"
        >
          {mode === 'app' ? t('useBackup') : t('useApp')}
        </button>
        <button
          type="button"
          onClick={() =>
            void signOut().finally(() => router.replace('/connexion'))
          }
          className="min-h-11 text-sm text-ink-soft hover:underline"
        >
          {t('signOut')}
        </button>
      </div>
      <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-muted">
        {t('lostDevice')}
      </p>
    </AuthCard>
  );
}
