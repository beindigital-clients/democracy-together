'use client';

import { useConvexAuth } from 'convex/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Bouton « Rejoindre » (→ demande d'adhésion). Masqué lorsque l'utilisateur est
// déjà connecté : un membre n'a plus à « rejoindre » — le changement de statut se
// gère dans son espace personnel.
//
// CE COMPOSANT EST LA CAUSE RACINE DE F-13. Rendre `null` le temps que Convex
// réponde faisait surgir 94 px dans une grappe ancrée à droite (`ml-auto`,
// site-header.tsx:41) : la bascule de langue sautait de 104 px VERS LA GAUCHE
// après le premier rendu, et un appui visant « EN » tombait sur le conteneur.
// Mesuré : au clic, la cible réelle était un `div`, jamais le bouton.
//
// `connecteAuRendu` vient du SERVEUR (`isAuthenticatedNextjs()`). Quand il est
// fourni, la variante FINALE est rendue dès le HTML servi : un visiteur anonyme
// voit le bouton tout de suite, un visiteur connecté ne voit rien du tout — et
// aucun des deux ne subit de décalage.
//
// Sans lui (appel hérité), on retombe sur `invisible` : la boîte est conservée,
// donc la largeur exacte dans toutes les langues, sans avoir à la deviner, et
// l'élément sort du parcours clavier et de l'arbre d'accessibilité.
export function JoinButton({
  className,
  onClick,
  connecteAuRendu,
}: {
  className?: string;
  onClick?: () => void;
  connecteAuRendu?: boolean;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('nav');

  const connecte = isLoading ? connecteAuRendu : isAuthenticated;
  if (connecte === true) return null;

  const enAttente = connecte === undefined;
  return (
    <Button asChild className={cn(className, enAttente && 'invisible')}>
      <Link
        href="/adhesion"
        onClick={onClick}
        aria-hidden={enAttente || undefined}
        tabIndex={enAttente ? -1 : undefined}
      >
        {t('join')}
      </Link>
    </Button>
  );
}
