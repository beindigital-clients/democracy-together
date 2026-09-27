'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps, ReactNode } from 'react';
import type { RegionGlobe as RegionGlobeType } from './region-globe';

// Chargement différé du globe (audit § 5.6).
//
// `region-globe` embarque d3-geo, topojson-client et la topologie mondiale de
// world-atlas — un chunk de 136 Ko à lui seul. Importé statiquement, il entrait
// dans le chemin critique de TROIS pages (/, /barometre, /le-reseau) et
// retardait l'hydratation de tout le reste, alors que le commentaire de
// `region-geo.ts` promettait l'inverse.
//
// `ssr: false` est volontaire et sans perte : le globe est dessiné dans un
// <canvas> à partir de mesures du DOM, il ne produit donc AUCUN contenu au
// rendu serveur. L'information reste accessible ailleurs sur chaque page
// (annuaire en liste, tableaux du baromètre) — le globe est un enrichissement
// visuel, pas le seul chemin vers la donnée.
//
// Ce fichier est un composant CLIENT : `ssr: false` n'est pas autorisé depuis
// un composant serveur dans l'App Router, d'où ce mince emballage.

const Globe = dynamic(
  () => import('./region-globe').then((m) => m.RegionGlobe),
  {
    ssr: false,
    // Réserve la place exacte du globe : sans cela, son arrivée décalerait la
    // mise en page (CLS) une fois le chunk chargé.
    loading: () => (
      <div
        aria-hidden="true"
        className="aspect-square w-full rounded-full bg-surface-2"
      />
    ),
  },
);

// `fallback` : légende affichée SANS JavaScript, par-dessus le disque de
// réservation. Mesuré le 27/09 (transversal C-3) : /barometre et /le-reseau
// montraient un grand disque gris nu, sans un mot. Le `<noscript>` n'existe
// que dans le HTML servi à un navigateur sans script ; avec script, le globe
// prend la place et rien ne se superpose.
export function RegionGlobeLazy({
  fallback,
  ...props
}: ComponentProps<typeof RegionGlobeType> & { fallback?: ReactNode }) {
  return (
    <div className="relative">
      <Globe {...props} />
      {fallback ? (
        <noscript>
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <p className="max-w-[32ch] text-sm leading-relaxed text-ink-soft">
              {fallback}
            </p>
          </div>
        </noscript>
      ) : null}
    </div>
  );
}
