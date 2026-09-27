import {
  Newsreader,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Arabic,
  Noto_Naskh_Arabic,
} from 'next/font/google';

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

// --- Arabe -------------------------------------------------------------------
//
// L'audit relevait que `subsets: ['latin']` ne charge AUCUN glyphe arabe, et
// qu'une page en arabe retomberait donc sur une police système, hors charte
// (issue #23). Ces deux familles ferment ce point.
//
// LE COUPLE EST CHOISI POUR TENIR LE MÊME CONTRASTE que le latin, pas pour
// « avoir de l'arabe ». L'écriture arabe n'oppose pas serif et sans : elle
// oppose des STYLES CALLIGRAPHIQUES. Le naskh est la main des livres et de la
// presse — c'est lui qui porte la voix éditoriale que Newsreader porte en
// latin. Le second est la déclinaison arabe de la superfamille Plex déjà
// employée pour l'interface : mêmes proportions, même dessin, aucune rupture
// quand une page mêle les deux écritures (un nom propre latin dans un titre
// arabe, un score du Baromètre).
//   Noto Naskh Arabic  -> voix éditoriale (titres, citations)   ~ Newsreader
//   IBM Plex Sans Arabic -> interface, corps de texte           ~ IBM Plex Sans
//
// AUCUNE DES DEUX N'EST PRÉCHARGÉE, et c'est délibéré. `preload: true` pose
// l'indice sur TOUTES les pages, y compris les quatre langues latines qui
// n'afficheront jamais un glyphe arabe — exactement la régression de LCP que
// l'arbitrage ci-dessus a écartée pour les titres. Les variables CSS ne sont
// d'ailleurs attachées au `<html>` que sur les pages arabes (voir
// `src/app/[locale]/layout.tsx`), donc rien ne déclenche le téléchargement
// ailleurs.
//
// PAS DE MONOSPACE ARABE. IBM Plex Mono ne dessine pas l'arabe, et il n'a pas
// à le faire : ce rôle porte des CHIFFRES (scores, KPI, dates), écrits en
// chiffres arabes occidentaux dans les cinq langues du site. Le texte arabe
// qui côtoie ces chiffres retombe sur Plex Sans Arabic, déclaré juste après
// dans la pile de `--ff-data` (voir `globals.css`).
//
// `subsets: ['arabic', 'latin']` — le latin est nécessaire, pas décoratif :
// un texte arabe cite des sigles, des noms d'organisation et des URL en
// caractères latins. Sans ce sous-ensemble, chacun de ces fragments basculerait
// sur une police système au milieu d'une phrase.

export const naskhArabic = Noto_Naskh_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-naskh-arabic',
  display: 'swap',
  preload: false,
});

export const plexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans-arabic',
  display: 'swap',
  preload: false,
});

/**
 * Les variables de police à poser sur `<html>` pour une locale donnée.
 *
 * Les familles arabes ne sont attachées QUE sur les pages arabes. Une variable
 * CSS non attachée laisse `var(--font-naskh-arabic)` sans valeur, donc la pile
 * de `globals.css` passe directement au terme suivant : les pages latines ne
 * voient jamais ces familles, et le navigateur n'a aucune raison de les
 * chercher.
 */
export function fontVariables(locale: string): string {
  const latin = `${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`;
  return locale === 'ar'
    ? `${latin} ${naskhArabic.variable} ${plexSansArabic.variable}`
    : latin;
}
