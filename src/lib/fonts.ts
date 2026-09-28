import {
  Newsreader,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Arabic,
  Noto_Naskh_Arabic,
} from 'next/font/google';

// Three typographic roles, self-hosted via next/font (font-display: swap).
//
// PRELOADING — only the BODY font is preloaded (audit F-05). Next adds a
// preload hint for every declared family; all three together
// put 233 KB on the critical path of a page that weighs only 244.
// Measured on slow 3G on /fr/barometre, whose LCP element is a paragraph:
//   all three preloaded     -> LCP 4,328 ms
//   body only preloaded     -> LCP 2,376 ms
//   headings re-preloaded   -> LCP 2,660 ms  (tried for the home page, rejected)
// Headings and data fonts therefore load on demand: `display: swap`
// shows them in a system font first, then swaps. It is the right
// trade-off when the primary expected usage is on low bandwidth.
//
// WEIGHTS — `font-bold` appears nowhere in `src/` (counted: 0) and
// italics are only used three times there, on BODY text. Plex
// Sans's 700 and Newsreader's italic were therefore removed: 63 KB less, and
// no visual change since nothing used them.
// Newsreader = editorial voice (headings, quotes).
// IBM Plex Sans = interface (buttons, forms, metadata).
// IBM Plex Mono = data (Barometer scores, KPIs, meta).

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

// --- Arabic ------------------------------------------------------------------
//
// The audit noted that `subsets: ['latin']` loads NO Arabic glyph, and
// that a page in Arabic would therefore fall back to a system font, off-brand
// (issue #23). These two families close that point.
//
// THE PAIR IS CHOSEN TO HOLD THE SAME CONTRAST as the Latin one, not just to
// "have Arabic". Arabic script does not contrast serif and sans: it
// contrasts CALLIGRAPHIC STYLES. Naskh is the hand of books and of the
// press — it carries the editorial voice that Newsreader carries in
// Latin. The second is the Arabic variant of the Plex superfamily already
// used for the interface: same proportions, same design, no break
// when a page mixes both scripts (a Latin proper noun in an Arabic
// heading, a Barometer score).
//   Noto Naskh Arabic  -> editorial voice (headings, quotes)   ~ Newsreader
//   IBM Plex Sans Arabic -> interface, body text               ~ IBM Plex Sans
//
// NEITHER IS PRELOADED, and that is deliberate. `preload: true` adds
// the hint on ALL pages, including the four Latin-script languages that
// will never display an Arabic glyph — exactly the LCP regression that
// the trade-off above ruled out for headings. The CSS variables are
// moreover only attached to `<html>` on Arabic pages (see
// `src/app/[locale]/layout.tsx`), so nothing triggers the download
// elsewhere.
//
// NO ARABIC MONOSPACE. IBM Plex Mono does not draw Arabic, and it doesn't
// need to: this role carries DIGITS (scores, KPIs, dates), written in
// Western Arabic digits in all five site languages. Arabic text
// next to these digits falls back to Plex Sans Arabic, declared right after
// in the `--ff-data` stack (see `globals.css`).
//
// `subsets: ['arabic', 'latin']` — Latin is necessary, not decorative:
// an Arabic text cites acronyms, organization names and URLs in
// Latin characters. Without this subset, each of these fragments would switch
// to a system font in the middle of a sentence.

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
 * The font variables to set on `<html>` for a given locale.
 *
 * The Arabic families are attached ONLY on Arabic pages. An unattached CSS
 * variable leaves `var(--font-naskh-arabic)` without a value, so the
 * `globals.css` stack moves straight on to the next term: Latin pages never
 * see these families, and the browser has no reason to
 * fetch them.
 */
export function fontVariables(locale: string): string {
  const latin = `${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`;
  return locale === 'ar'
    ? `${latin} ${naskhArabic.variable} ${plexSansArabic.variable}`
    : latin;
}
