'use client';

import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';

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
  const router = useRouter();
  const t = useTranslations('auth');

  // LA DÉCONNEXION NAVIGUE ELLE-MÊME (auth A-6). `signOut()` ne fait que vider
  // les jetons : sur une page privée, c'était la garde `AuthGate` qui, 1,2 s
  // plus tard, remplaçait la page par le formulaire de connexion — l'URL
  // restait `/espace-membre` sous ce formulaire, et « Précédent » ressortait
  // une entrée `/connexion?_rsc=…`, l'URL interne d'un prefetch RSC (mesuré
  // le 27/09). `replace` vers l'accueil, une route propre, juste après la
  // sortie : la garde est démontée avant d'avoir à rediriger, et l'historique
  // ne garde aucune URL qu'on ne peut pas partager.
  async function onSignOut() {
    await signOut();
    router.replace('/');
  }

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
          onClick={onSignOut}
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
