import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

// Trois rôles typographiques, auto-hébergés via next/font (font-display: swap).
//
// PRÉCHARGEMENT — seule la police de CORPS l'est (audit F-05). Next pose un
// indice de préchargement pour chaque famille déclarée ; les trois ensemble
// mettaient 233 Ko sur le chemin critique d'une page qui n'en pèse que 244.
// Mesuré en 3G lente sur /fr/barometre, dont l'élément LCP est un paragraphe :
//   les trois préchargées   -> LCP 4 328 ms
//   corps seul préchargé    -> LCP 2 376 ms
//   titres re-préchargés    -> LCP 2 660 ms  (essayé pour l'accueil, écarté)
// Les titres et les données se chargent donc à la demande : `display: swap`
// les fait paraître en police système d'abord, puis basculer. C'est le bon
// arbitrage quand le premier usage attendu est à faible débit.
//
// GRAISSES — `font-bold` n'apparaît nulle part dans `src/` (compté : 0) et
// l'italique n'y sert que trois fois, sur du texte de CORPS. Le 700 de Plex
// Sans et l'italique de Newsreader ont donc été retirés : 63 Ko de moins, et
// aucun changement visuel puisque rien ne les employait.
// Newsreader = voix éditoriale (titres, citations).
// IBM Plex Sans = interface (boutons, formulaires, métadonnées).
// IBM Plex Mono = la donnée (scores Baromètre, KPI, méta).
//
// `subsets: ['latin']` uniquement : cela couvre le français et l'anglais, les
// deux seules langues au périmètre. Aucun glyphe arabe n'est donc chargé — une
// page en arabe retomberait sur une police système, hors charte. Ajouter le
// sous-ensemble arabe (et IBM Plex Sans Arabic) fait partie du chantier RTL,
// pas d'un réglage isolé ici : voir l'issue #23.
export const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-newsreader',
  display: 'swap',
  preload: false,
});

export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
});
