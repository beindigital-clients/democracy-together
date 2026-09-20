'use client';

import { useEffect } from 'react';

// Après un saut d'ancre, le FOCUS doit suivre le défilement (issue #46) : sinon
// la tabulation repart du lien cliqué — en bas de page, dans le pied de page —
// et le lien ne sert à rien au clavier ni au lecteur d'écran.
//
// Le navigateur sait le faire seul : « scroll to the fragment » focalise la
// cible du fragment, d'où le `tabIndex={-1}` posé sur les sections (une
// `<section>` nue n'est pas focusable, le focus n'a alors nulle part où aller).
// Cela couvre le chargement direct de `/a-propos#gouvernance` et le retour
// arrière.
//
// Mais un lien du pied de page est une navigation CLIENTE, et depuis Next 16 le
// gestionnaire de défilement de l'App Router (`InnerScrollHandlerNew`, activé
// par défaut) défile vers l'ancre en « laissant le focus intact ». Vérifié au
// navigateur : sans ce composant, le focus reste sur le lien du pied de page.
//
// Ce composant ne fait donc QUE reposer le focus, et ne défile pas de lui-même
// (`preventScroll`) : le déplacement reste celui du navigateur, donc soumis à
// `scroll-behavior`, que globals.css force à `auto` sous
// `prefers-reduced-motion`. Un `scrollIntoView({ behavior: 'smooth' })` maison
// contournerait cette préférence — c'est précisément ce qu'il ne faut pas faire.
//
// Il est monté par la PAGE qui porte les ancres, pas par le layout : il n'agit
// que sur les cibles de cette page (`focus()` sur un élément non focusable est
// sans effet) et ne coûte rien aux autres routes.
function focusTarget(hash: string): HTMLElement | null {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const el = id ? document.getElementById(id) : null;
  el?.focus({ preventScroll: true });
  return el;
}

export function AnchorFocus() {
  useEffect(() => {
    // Navigation cliente depuis une AUTRE route : la page vient d'être montée
    // et l'URL porte déjà l'ancre. Au chargement direct, le navigateur a déjà
    // focalisé la cible — la reposer au même endroit est sans effet.
    focusTarget(window.location.hash);

    const onHistory = () => focusTarget(window.location.hash);

    // Clic sur une ancre de la page COURANTE — le pied de page est aussi rendu
    // sur `/a-propos`. Le routeur pousse l'URL sans remonter l'arbre : aucun
    // effet ne se rejoue, et aucun `hashchange` n'est émis puisque Next passe
    // par `history.pushState`. Il ne reste que le clic lui-même.
    //
    // En phase de CAPTURE : le `<Link>` de Next annule l'évènement
    // (`preventDefault`, c'est ainsi qu'il prend la main sur la navigation)
    // depuis le gestionnaire délégué de React, posé sur `document` — donc avant
    // nous en phase de bulle, et `defaultPrevented` serait toujours vrai.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
      if (link.origin !== window.location.origin) return;
      if (link.pathname !== window.location.pathname) return;

      const target = focusTarget(link.hash);

      // URL strictement identique : le routeur considère qu'il n'y a rien à
      // faire et ne défile pas. C'est au lien de tenir sa promesse — par le
      // défilement du NAVIGATEUR, sans option, donc gouverné par la même règle
      // `scroll-behavior` que le reste.
      if (target && link.href === window.location.href) target.scrollIntoView();
    };

    window.addEventListener('hashchange', onHistory);
    window.addEventListener('popstate', onHistory);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', onHistory);
      window.removeEventListener('popstate', onHistory);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
