// Regenerates the EMBEDDED fonts of the annual reports PDF (F-41).
//
//   node scripts/report-pdf-fonts.mjs
//
// WHY FONTS IN THE REPO. The PDF is composed in a Convex action
// (Node runtime): it has access neither to the site's `public/` folder, nor
// to system fonts, and must not depend on any service at
// generation time. The fonts therefore travel WITH the code, base64-encoded in
// TypeScript modules that the Convex bundler embeds like any other
// constant.
//
// WHY THESE FAMILIES. They are the site's (src/app/globals.css):
// Newsreader for Latin headings, IBM Plex Sans for body text, IBM Plex
// Sans Arabic for Arabic. Plex Sans Arabic was preferred over Noto Naskh
// Arabic (the site's Arabic heading font) after MEASUREMENT: Naskh joins its
// letters by cursive positioning (vertical offsets), which splits
// each word into dozens of text operators and makes text extraction
// unreadable; Plex Sans Arabic joins on the baseline
// (docs/backlog/editorial.md § Mesure).
//
// Source: the Google Fonts API, which serves static TrueType when the user
// agent does not claim WOFF2. License: SIL Open Font License 1.1
// (embedding and redistribution allowed).
import { writeFileSync, mkdirSync } from 'node:fs';

const FONTS = [
  { module: 'newsreader500', family: 'Newsreader', weight: 500 },
  { module: 'plexSans400', family: 'IBM Plex Sans', weight: 400 },
  { module: 'plexSans600', family: 'IBM Plex Sans', weight: 600 },
  { module: 'plexArabic400', family: 'IBM Plex Sans Arabic', weight: 400 },
  { module: 'plexArabic600', family: 'IBM Plex Sans Arabic', weight: 600 },
];

const OUT = new URL('../convex/lib/reportPdf/fonts/', import.meta.url);
mkdirSync(OUT, { recursive: true });

for (const font of FONTS) {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${font.weight}`,
      // A user agent with no WOFF2 claim: the API responds with TrueType.
      { headers: { 'user-agent': 'report-pdf-fonts' } },
    )
  ).text();
  const url = /url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
  if (!url)
    throw new Error(`Pas de TrueType pour ${font.family} ${font.weight}`);
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  // `'use node'`: these modules only serve the Node action that composes the
  // PDF; without the directive, Convex would also embed them in the runtime
  // of queries and mutations, where they have no business.
  const body =
    `'use node';\n\n` +
    `// GÉNÉRÉ par scripts/report-pdf-fonts.mjs — ne pas éditer.\n` +
    `// ${font.family} ${font.weight} (SIL Open Font License 1.1), ${bytes.length} octets.\n` +
    `export default '${bytes.toString('base64')}';\n`;
  writeFileSync(new URL(`${font.module}.ts`, OUT), body);
  console.log(`${font.module}: ${bytes.length} octets`);
}
