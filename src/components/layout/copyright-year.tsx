'use client';

import { useEffect, useState } from 'react';

// Année de la mention de copyright du pied de page (issue #36).
//
// Elle est calculée CÔTÉ SERVEUR — `site-footer.tsx` est un composant serveur —
// et reçue ici en `serverYear`. Le HTML servi porte donc déjà la bonne année,
// y compris pour un visiteur sans JavaScript (F-05, faible débit).
//
// Ce composant existe pour deux écueils que le seul calcul serveur ne couvre
// pas ensemble :
//
//  1. ÉCART D'HYDRATATION — le piège de l'issue. Lire l'horloge pendant le
//     RENDU d'un composant client produirait, la nuit du 31 décembre ou depuis
//     un fuseau décalé, un HTML serveur et un premier rendu client différents ;
//     React signale l'écart et rejoue l'arbre. Ici le premier rendu client
//     réutilise `serverYear` à l'identique : il n'y a aucun écart à signaler,
//     donc rien à masquer avec `suppressHydrationWarning`.
//
//  2. PAGE FIGÉE. Tant que les routes sont dynamiques, le calcul serveur suffit.
//     Mais l'issue #13 vise un rendu statique servi par CDN : le HTML serait
//     alors produit une fois au build puis servi des mois durant, et l'année
//     s'y figerait — le bogue corrigé ici reviendrait sous une autre forme.
//     La rectification a donc lieu APRÈS le montage, dans un effet, et
//     seulement si le navigateur est dans une année POSTÉRIEURE au rendu servi.
//     Le cas normal (mêmes années) ne déclenche aucun rendu de plus.
export function CopyrightYear({ serverYear }: { serverYear: number }) {
  const [year, setYear] = useState(serverYear);

  useEffect(() => {
    // Correction VERS L'AVANT seulement. Une horloge d'appareil en retard — le
    // cas n'a rien d'exceptionnel sur les terminaux d'entrée de gamme visés par
    // le cadrage — afficherait sinon une année ANTÉRIEURE à celle du rendu,
    // c'est-à-dire un pied de page plus faux que celui qu'on corrige.
    const browserYear = new Date().getFullYear();
    if (browserYear > serverYear) setYear(browserYear);
  }, [serverYear]);

  return <>{year}</>;
}
