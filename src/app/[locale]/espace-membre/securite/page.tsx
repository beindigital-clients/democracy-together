'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { TwoFactorSettings } from '@/components/account/two-factor-settings';
import { ArrowBack } from '@/components/ui/arrow';

// SÉCURITÉ DU COMPTE — double authentification (chantier comptes).
//
// Seul écran ouvert à un compte d'encadrement tenu d'inscrire sa 2FA
// (`allowEnrollment`) : la garde de tous les autres l'y renvoie.
function SecurityScreen() {
  const t = useTranslations('twoFactor');
  const tAccounts = useTranslations('accounts');
  // `users.current` est nul tant que l'inscription obligatoire n'est pas
  // faite : l'adresse ne sert qu'à titrer le fichier de codes, elle peut
  // manquer sans rien empêcher.
  const me = useQuery(api.users.current);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/espace-membre"
        className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted hover:text-ink"
      >
        <ArrowBack /> {tAccounts('backToMemberSpace')}
      </Link>
      <h1 className="mt-4 font-display text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-[65ch] leading-relaxed text-ink-soft">
        {t('intro')}
      </p>
      <TwoFactorSettings email={me?.email ?? ''} />
    </div>
  );
}

export default function SecuritePage() {
  return (
    <AuthGate className="max-w-md" allowEnrollment>
      <SecurityScreen />
    </AuthGate>
  );
}
