'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useMutation } from 'convex/react';
import { usePathname } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';
import { audienceAllowed, isMeasuredPath } from '@/lib/audience';

// BALISE DE MESURE D'AUDIENCE (F-66, chantier diffusion) — ne rend rien.
//
// Une page vue = un appel à `audience.hit`, avec quatre informations et pas
// une de plus : le chemin (sans requête ni préfixe de langue : c'est ce que
// rend `usePathname` de next-intl), la langue, le référent (au PREMIER
// affichage seulement — ensuite, le référent d'une navigation interne serait
// notre propre site) et la largeur de fenêtre, que le serveur réduit à une
// classe. Aucun cookie, aucun
// identifiant, rien en stockage local.
//
// Respect de l'opposition À LA SOURCE (`audienceAllowed`) : Do Not Track /
// GPC, « Essentiels uniquement », ou le réglage de la politique de
// confidentialité — dans ces cas, rien ne part.
//
// Un échec d'envoi est ignoré : la mesure ne doit jamais rien casser dans la
// page, ni afficher quoi que ce soit.
export function AudienceBeacon() {
  const pathname = usePathname();
  const locale = useLocale();
  const hit = useMutation(api.audience.hit);
  const first = useRef(true);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    last.current = pathname;
    const referrer = first.current ? document.referrer || undefined : undefined;
    first.current = false;
    if (!isMeasuredPath(pathname) || !audienceAllowed()) return;
    hit({
      path: pathname,
      lang: locale,
      referrer,
      width: window.innerWidth,
    }).catch(() => {
      /* mesure perdue : sans conséquence pour la page */
    });
  }, [pathname, locale, hit]);

  return null;
}
