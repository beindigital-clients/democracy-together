import { v } from 'convex/values';

// ANNUAL REPORTS (F-41) — vocabulary, bounds and content fingerprint,
// shared by the backend (convex/annualReports.ts), the action that composes the
// PDF and the admin screen (which reads the SAME bounds for its
// counters, through the `@convex/lib/annualReports` alias).
//
// Pure module: it only pulls in `convex/values`.

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
 * Cleans up entered content and validates it against the bounds. Throws a
 * NAMED error (the screen translates it) at the first faulty field.
 *
 * Empty paragraphs are removed BEFORE counting: a blank line
 * left at the end of a chapter is not an input error.
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
 * Fingerprint of one language's content (FNV-1a on 53 bits, in base 36).
 *
 * It ties a PDF to the text it came from: the PDF is served ONLY if its
 * fingerprint is that of the current content. A report corrected after
 * generation therefore never offers a PDF that contradicts it — the button
 * disappears until the regeneration (scheduled on write) completes.
 * No cryptographic primitive: the point is to detect a change, not
 * to resist an adversary, and the Convex mutation runtime does not have
 * `crypto.subtle` synchronously.
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
