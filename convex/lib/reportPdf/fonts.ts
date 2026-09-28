'use node';

import newsreader500 from './fonts/newsreader500';
import plexSans400 from './fonts/plexSans400';
import plexSans600 from './fonts/plexSans600';
import plexArabic400 from './fonts/plexArabic400';
import plexArabic600 from './fonts/plexArabic600';

// Embedded fonts of the report PDF (F-41) — the site's own, decoded once per
// action instance. Regenerate with: `node scripts/report-pdf-fonts.mjs`.
export type FontKey = 'display' | 'body' | 'bodyBold' | 'arabic' | 'arabicBold';

const SOURCES: Record<FontKey, string> = {
  display: newsreader500,
  body: plexSans400,
  bodyBold: plexSans600,
  arabic: plexArabic400,
  arabicBold: plexArabic600,
};

let cache: Record<FontKey, Buffer> | null = null;

export function loadFonts(): Record<FontKey, Buffer> {
  if (!cache) {
    cache = Object.fromEntries(
      Object.entries(SOURCES).map(([k, b64]) => [
        k,
        Buffer.from(b64, 'base64'),
      ]),
    ) as Record<FontKey, Buffer>;
  }
  return cache;
}
