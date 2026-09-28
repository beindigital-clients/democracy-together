// Régénère les polices EMBARQUÉES du PDF des rapports annuels (F-41).
//
//   node scripts/report-pdf-fonts.mjs
//
// POURQUOI DES POLICES DANS LE DÉPÔT. Le PDF est composé dans une action
// Convex (runtime Node) : elle n'a ni accès au dossier `public/` du site, ni
// aux polices système, et ne doit dépendre d'aucun service au moment de
// générer. Les polices voyagent donc AVEC le code, encodées en base64 dans des
// modules TypeScript que le bundler Convex embarque comme n'importe quelle
// constante.
//
// POURQUOI CES FAMILLES. Ce sont celles du site (src/app/globals.css) :
// Newsreader pour les titres latins, IBM Plex Sans pour le texte, IBM Plex
// Sans Arabic pour l'arabe. Plex Sans Arabic a été préférée à Noto Naskh
// Arabic (la police de titre arabe du site) après MESURE : Naskh attache ses
// lettres par positionnement cursif (décalages verticaux), ce qui découpe
// chaque mot en dizaines d'opérateurs de texte et rend l'extraction du texte
// illisible ; Plex Sans Arabic se lie sur la ligne de base
// (docs/backlog/editorial.md § Mesure).
//
// Source : l'API Google Fonts, qui sert du TrueType statique quand l'agent
// utilisateur ne revendique pas WOFF2. Licence : SIL Open Font License 1.1
// (embarquement et redistribution autorisés).
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
      // Un agent sans prétention WOFF2 : l'API répond en TrueType.
      { headers: { 'user-agent': 'report-pdf-fonts' } },
    )
  ).text();
  const url = /url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
  if (!url)
    throw new Error(`Pas de TrueType pour ${font.family} ${font.weight}`);
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  // `'use node'` : ces modules ne servent qu'à l'action Node qui compose le
  // PDF ; sans la directive, Convex les embarquerait aussi dans le runtime
  // des requêtes et mutations, où ils n'ont rien à faire.
  const body =
    `'use node';\n\n` +
    `// GÉNÉRÉ par scripts/report-pdf-fonts.mjs — ne pas éditer.\n` +
    `// ${font.family} ${font.weight} (SIL Open Font License 1.1), ${bytes.length} octets.\n` +
    `export default '${bytes.toString('base64')}';\n`;
  writeFileSync(new URL(`${font.module}.ts`, OUT), body);
  console.log(`${font.module}: ${bytes.length} octets`);
}
