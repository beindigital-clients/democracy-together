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
// PENDANT LE CHARGEMENT, LA PLACE EST RÉSERVÉE — c'est la cause racine de F-13.
// Rendre `null` le temps que Convex réponde faisait surgir 94 px dans une grappe
// ancrée à droite (`ml-auto`, site-header.tsx:41) : tout ce qui la précède —
// dont la bascule de langue — sautait de 104 px VERS LA GAUCHE, après le premier
// rendu. Un appui visant « EN » partait alors vers une position que le bouton
// venait de quitter et tombait sur le conteneur, sans le moindre retour.
// Mesuré : au clic, la cible réelle était un `div`, jamais le bouton.
//
// `invisible` (visibility: hidden) conserve la boîte — donc la largeur exacte,
// dans toutes les langues, sans avoir à la deviner — tout en retirant l'élément
// du parcours au clavier et de l'arbre d'accessibilité. `AuthButton`, juste à
// côté, réservait déjà la sienne (`h-5 w-16`) ; c'est ce voisinage qui a fini
// par rendre l'écart lisible.
//
// CE QUE CELA NE RÈGLE PAS, et il faut le dire : pour un visiteur CONNECTÉ, la
// place réservée ici est ensuite LIBÉRÉE (`isAuthenticated` → `null`). Son
// en-tête bougeait déjà — le gabarit d'`AuthButton` est bien plus étroit que
// « Espace membre · Déconnexion » — et ce correctif ajoute 94 px à ce
// mouvement-là. Le cas anonyme, lui, est mesuré et corrigé (0/40 → 12/12 sous
// bridage ×4). La vraie résolution des deux cas suppose de connaître l'état
// d'authentification au rendu SERVEUR : c'est un changement d'architecture,
// pas un correctif de composant.
export function JoinButton({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('nav');
  if (isAuthenticated) return null;
  return (
    <Button asChild className={cn(className, isLoading && 'invisible')}>
      <Link
        href="/adhesion"
        onClick={onClick}
        aria-hidden={isLoading || undefined}
        tabIndex={isLoading ? -1 : undefined}
      >
        {t('join')}
      </Link>
    </Button>
  );
}
