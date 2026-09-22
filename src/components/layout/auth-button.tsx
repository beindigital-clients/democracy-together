'use client';

import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// `connecteAuRendu` vient du SERVEUR (`isAuthenticatedNextjs()`, lu dans
// `site-header.tsx`). Tant que Convex n'a pas répondu, c'est lui qui décide de
// la variante affichée — donc le HTML servi porte DÉJÀ la mise en page finale,
// et l'en-tête ne se réorganise plus sous le doigt du visiteur (audit F-13).
//
// Sans lui, ce composant rendait un gabarit de 64 px puis le remplaçait par
// « Connexion » (66 px) ou par « Espace membre · Déconnexion », bien plus
// large : c'est cette seconde marche qui restait à corriger.
//
// La propriété reste FACULTATIVE : un appel sans elle retrouve l'ancien
// comportement, gabarit compris. Aucun appelant n'est cassé.
export function AuthButton({
  connecteAuRendu,
}: {
  connecteAuRendu?: boolean;
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const t = useTranslations('auth');

  const connecte = isLoading ? connecteAuRendu : isAuthenticated;

  // `undefined` = on ne sait pas encore et le serveur ne l'a pas dit : on
  // réserve la place plutôt que de parier.
  if (connecte === undefined) {
    return <span aria-hidden className="inline-block h-5 w-16" />;
  }

  if (connecte) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/espace-membre"
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          {t('memberSpace')}
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          {t('signOut')}
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/connexion"
      className="text-sm text-ink-soft transition-colors hover:text-ink"
    >
      {t('signIn')}
    </Link>
  );
}
