import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Une zone qui DÉFILE horizontalement, atteignable autrement qu'à la souris.
//
// Un `<div class="overflow-x-auto">` nu est un piège à l'envers : la souris
// fait défiler, le clavier non. Ce qui dépasse de l'écran devient alors
// littéralement inatteignable pour qui n'utilise pas de souris — et sur un
// tableau, ce sont des colonnes entières de données (axe
// `scrollable-region-focusable`, WCAG 2.1.1). Mesuré sur /fr/barometre et
// /fr/adhesion en mobile, où les tableaux débordent ; en desktop ils tiennent,
// et c'est pourquoi le défaut ne se voyait qu'en petit écran.
//
// `tabIndex` rend la zone focalisable, donc défilable aux flèches. Et puisque
// cela crée un arrêt de tabulation, il lui faut un NOM : arriver sur une boîte
// anonyme n'est guère mieux que de ne pas pouvoir y entrer du tout. Le libellé
// est donc OBLIGATOIRE, et on y passe le titre que la section porte déjà —
// aucune chaîne en dur, aucune clé de traduction nouvelle.
//
// Rendu côté serveur, sans JavaScript : le défaut corrigé ici est précisément
// celui d'un contenu qu'on ne peut pas atteindre.
//
// L'anneau de focus vient de la règle globale `:focus-visible` de
// globals.css — inutile de le répéter ici.

export function ScrollableRegion({
  label,
  className,
  children,
}: {
  /** Nom annoncé à l'entrée dans la zone. Généralement le titre du tableau. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn('overflow-x-auto', className)}
    >
      {children}
    </div>
  );
}
