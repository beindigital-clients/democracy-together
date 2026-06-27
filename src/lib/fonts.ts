import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

// Trois rôles typographiques, auto-hébergés via next/font (font-display: swap).
// Newsreader = voix éditoriale (titres, citations).
// IBM Plex Sans = interface (couverture multilingue + sibling arabe pour le RTL).
// IBM Plex Mono = la donnée (scores Baromètre, KPI, méta).
export const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});
