import { v } from 'convex/values';

// RAPPORTS ANNUELS (F-41) — vocabulaire, bornes et empreinte du contenu,
// partagés par le backend (convex/annualReports.ts), l'action qui compose le
// PDF et l'écran d'administration (qui lit les MÊMES bornes pour ses
// compteurs, par l'alias `@convex/lib/annualReports`).
//
// Module pur : il ne tire que `convex/values`.

export const REPORT_BOUNDS = {
  yearMin: 2000,
  yearMax: 2100,
  title: { min: 4, max: 200 },
  intro: { min: 20, max: 2000 },
  chapters: { min: 1, max: 30 },
  heading: { min: 2, max: 200 },
  paragraphs: { min: 1, max: 40 },
  paragraph: { min: 2, max: 4000 },
  keyFigures: { max: 12 },
  figureValue: { min: 1, max: 40 },
  figureLabel: { min: 2, max: 160 },
} as const;

export const reportChapter = v.object({
  heading: v.string(),
  body: v.array(v.string()),
});

export const reportKeyFigure = v.object({
  value: v.string(),
  label: v.string(),
});

export const reportContentFields = {
  title: v.string(),
  intro: v.string(),
  chapters: v.array(reportChapter),
  keyFigures: v.array(reportKeyFigure),
};

export const reportContent = v.object(reportContentFields);

export type ReportChapter = { heading: string; body: string[] };
export type ReportKeyFigure = { value: string; label: string };
export type ReportContent = {
  title: string;
  intro: string;
  chapters: ReportChapter[];
  keyFigures: ReportKeyFigure[];
};

export const reportStatus = v.union(v.literal('draft'), v.literal('published'));

const within = (s: string, b: { min: number; max: number }) =>
  s.length >= b.min && s.length <= b.max;

/**
 * Nettoie un contenu saisi et le valide contre les bornes. Lève une erreur
 * NOMMÉE (l'écran la traduit) au premier champ fautif.
 *
 * Les paragraphes vides sont retirés AVANT le décompte : une ligne blanche
 * laissée en fin de chapitre n'est pas une faute de saisie.
 */
export function normalizeReportContent(input: ReportContent): ReportContent {
  const B = REPORT_BOUNDS;
  const title = input.title.trim();
  const intro = input.intro.trim();
  if (!within(title, B.title)) throw new Error('INVALID_TITLE');
  if (!within(intro, B.intro)) throw new Error('INVALID_INTRO');
  const chapters = input.chapters.map((c) => ({
    heading: c.heading.trim(),
    body: c.body.map((p) => p.trim()).filter((p) => p.length > 0),
  }));
  if (chapters.length < B.chapters.min || chapters.length > B.chapters.max)
    throw new Error('INVALID_CHAPTERS');
  for (const c of chapters) {
    if (!within(c.heading, B.heading)) throw new Error('INVALID_HEADING');
    if (c.body.length < B.paragraphs.min || c.body.length > B.paragraphs.max)
      throw new Error('INVALID_PARAGRAPHS');
    if (!c.body.every((p) => within(p, B.paragraph)))
      throw new Error('INVALID_PARAGRAPH');
  }
  const keyFigures = input.keyFigures
    .map((f) => ({ value: f.value.trim(), label: f.label.trim() }))
    .filter((f) => f.value.length > 0 || f.label.length > 0);
  if (keyFigures.length > B.keyFigures.max)
    throw new Error('INVALID_KEY_FIGURES');
  for (const f of keyFigures) {
    if (!within(f.value, B.figureValue) || !within(f.label, B.figureLabel))
      throw new Error('INVALID_KEY_FIGURE');
  }
  return { title, intro, chapters, keyFigures };
}

/**
 * Empreinte du contenu d'une langue (FNV-1a sur 53 bits, en base 36).
 *
 * Elle lie un PDF au texte dont il est issu : le PDF n'est servi QUE si son
 * empreinte est celle du contenu courant. Un rapport corrigé après la
 * génération ne propose donc jamais un PDF qui le contredit — le bouton
 * disparaît le temps que la régénération (planifiée à l'écriture) aboutisse.
 * Pas de primitive cryptographique : il s'agit de détecter un changement, pas
 * de résister à un adversaire, et le runtime Convex des mutations n'a pas
 * `crypto.subtle` en synchrone.
 */
export function reportContentHash(
  year: number,
  inaugural: boolean,
  content: ReportContent,
): string {
  const text = JSON.stringify([year, inaugural, content]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  const hi = (h2 >>> 0) & 0x1fffff;
  return (hi * 2 ** 32 + (h1 >>> 0)).toString(36);
}
