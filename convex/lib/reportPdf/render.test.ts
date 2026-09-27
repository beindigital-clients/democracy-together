// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderReportPdf, type ReportPdfInput } from './render';
import { CODED_REPORTS } from '../annualReportsCoded';
import { SITE_LOCALES, type SiteLocale } from '../locales';

// GÉNÉRATION DU PDF DES RAPPORTS (F-41). Ce que ces tests tiennent :
//  - le PDF S'OUVRE (pdf.js le lit sans erreur) ;
//  - le nombre de pages lu est celui que le générateur annonce (et que la
//    page du site affiche à côté du bouton) ;
//  - le titre est dans les métadonnées ET dans le texte extrait ;
//  - l'ARABE EXTRAIT EST LIÉ : chaque lettre employée à plusieurs positions
//    d'un mot est dessinée par plusieurs glyphes distincts (formes initiale,
//    médiane, finale), et les mots se relisent d'un seul tenant.
//
// Pour INSPECTER les PDF produits : `REPORT_PDF_OUT=/chemin pnpm exec vitest
// run convex/lib/reportPdf/render.test.ts` les écrit dans ce dossier, un par
// langue (c'est la commande de mesure citée dans docs/backlog/editorial.md).

const OUT = process.env.REPORT_PDF_OUT;

function inputFor(locale: SiteLocale): ReportPdfInput {
  const r = CODED_REPORTS[locale][2026];
  return {
    locale,
    year: r.year,
    inaugural: r.inaugural,
    title: r.title,
    intro: r.intro,
    chapters: r.chapters,
    keyFigures: r.keyFigures,
  };
}

async function open(bytes: Uint8Array) {
  // pdf.js détache le tampon qu'on lui passe : on lui donne une copie.
  return pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
}

async function allText(doc: pdfjs.PDFDocumentProxy): Promise<string> {
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return out.join('\n');
}

// Glyphes dessinés, avec leur code de caractère (CID) et le texte Unicode que
// le PDF leur associe (/ToUnicode). Une lettre arabe mise en forme
// contextuellement apparaît sous PLUSIEURS CID ; posée isolée, sous un seul.
async function glyphForms(
  doc: pdfjs.PDFDocumentProxy,
): Promise<Map<string, Set<number>>> {
  const forms = new Map<string, Set<number>>();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    ops.fnArray.forEach((fn, k) => {
      if (fn !== pdfjs.OPS.showText) return;
      const glyphs = ops.argsArray[k][0] as (
        { unicode: string; originalCharCode: number } | number
      )[];
      for (const g of glyphs) {
        if (typeof g === 'number' || !g.unicode) continue;
        const set = forms.get(g.unicode) ?? new Set<number>();
        set.add(g.originalCharCode);
        forms.set(g.unicode, set);
      }
    });
  }
  return forms;
}

// Composer un PDF prend de quelques centaines de millisecondes à quelques
// secondes quand toute la suite tourne en parallèle : délai élargi.
describe('PDF des rapports annuels (F-41)', { timeout: 60_000 }, () => {
  it.each(SITE_LOCALES)(
    '%s : s’ouvre, annonce le bon nombre de pages, porte titre et langue',
    async (locale) => {
      const input = inputFor(locale);
      const { bytes, pages } = await renderReportPdf(input);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `rapport-2026-${locale}.pdf`), bytes);
      }
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      const doc = await open(bytes);
      expect(doc.numPages).toBe(pages);
      expect(pages).toBeGreaterThanOrEqual(2);

      const { info } = (await doc.getMetadata()) as {
        info: Record<string, unknown>;
      };
      expect(info.Title).toBe(input.title);
      expect(info.Author).toBe('Democracy Together');
      expect(info.Language).toBe(locale);

      // Balisage : le catalogue déclare un PDF marqué, et l'arbre de
      // structure existe (lu par pdf.js page par page).
      const tree = await (await doc.getPage(1)).getStructTree();
      expect(tree?.children.length).toBeGreaterThan(0);

      // Le titre se relit dans le texte extrait (espaces normalisés).
      const text = (await allText(doc)).replace(/\s+/g, ' ');
      const firstWord = input.title.split(' ')[0];
      expect(text).toContain(firstWord);
      await doc.destroy();
    },
  );

  it('arabe : les lettres sont LIÉES (formes contextuelles), les mots se relisent entiers', async () => {
    const input = inputFor('ar');
    const { bytes } = await renderReportPdf(input);
    const doc = await open(bytes);

    // 1. Formes contextuelles. ب (beh), ت (teh), ن (noon), م (meem), ي (yeh)
    //    apparaissent dans le rapport en début, milieu et fin de mot : une
    //    composition correcte les dessine avec au moins trois glyphes
    //    différents chacun ; une composition « lettre par lettre » n'en
    //    utiliserait qu'un.
    const forms = await glyphForms(doc);
    for (const letter of ['ب', 'ت', 'ن', 'م', 'ي']) {
      expect(
        forms.get(letter)?.size ?? 0,
        `formes de ${letter}`,
      ).toBeGreaterThanOrEqual(3);
    }
    // Et, globalement, la majorité des lettres arabes employées ont plus
    // d'une forme.
    const arabic = [...forms.entries()].filter(([u]) => /^[ء-ي]$/u.test(u));
    const joined = arabic.filter(([, cids]) => cids.size > 1);
    expect(joined.length / arabic.length).toBeGreaterThan(0.6);

    // 2. Texte extrait : les mots du titre se relisent d'un seul tenant, dans
    //    l'ordre logique — pas une suite de lettres séparées, pas un mot
    //    retourné.
    const text = await allText(doc);
    expect(text).toContain('تقرير');
    expect(text).toContain('النشاط');
    expect(text).not.toMatch(/ت ق ر ي ر/u);
    expect(text).not.toContain('ريرقت');
    // Ligatures : lam-alif (obligatoire) et ligatures de la police se
    // relisent dans l'ordre logique (cf. `visualOrderLigatures`).
    expect(text).toContain('الإصدار');
    expect(text).toContain('المشتركة');
    expect(text).toContain('بين');
    // Le chiffre de l'année n'est pas retourné par le sens de lecture.
    expect(text).toContain('2026');
    expect(text).not.toContain('6202');
    await doc.destroy();
  });

  it('pagination : un rapport long s’étend sur plusieurs pages, toutes comptées', async () => {
    const base = inputFor('fr');
    const long: ReportPdfInput = {
      ...base,
      chapters: Array.from({ length: 6 }, (_, i) => ({
        heading: `Chapitre ${i + 1}`,
        body: base.chapters.flatMap((c) => c.body),
      })),
      keyFigures: [
        { value: '12', label: 'organisations membres' },
        { value: '5', label: 'axes de travail' },
        { value: '2026', label: 'année de fondation' },
        { value: '1', label: 'baromètre' },
      ],
    };
    const { bytes, pages } = await renderReportPdf(long);
    const doc = await open(bytes);
    expect(pages).toBeGreaterThan(4);
    expect(doc.numPages).toBe(pages);
    const lastPage = await doc.getPage(pages);
    const footer = (await lastPage.getTextContent()).items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ');
    expect(footer).toContain(`Page ${pages} sur ${pages}`);
    await doc.destroy();
  });
});
