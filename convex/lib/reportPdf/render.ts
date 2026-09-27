'use node';

import PDFDocument from 'pdfkit';
import { isRtlLocale, type SiteLocale } from '../locales';
import { loadFonts, type FontKey } from './fonts';
import { pageLabel, REPORT_PDF_LABELS } from './labels';
import {
  breakLines,
  logicalText,
  placeLine,
  tokenize,
  type Direction,
} from './layout';

// COMPOSITION DU PDF D'UN RAPPORT ANNUEL (F-41) — pdfkit + fontkit, en
// JavaScript pur, exécuté dans une action Convex (runtime Node).
//
// Le choix de la technique est MESURÉ (docs/backlog/editorial.md § Mesure) :
// fontkit applique les tables OpenType de la police, donc les formes
// contextuelles et les ligatures arabes ; le placement bidirectionnel des mots
// est fait par `./layout` ; pdfkit fournit le PDF balisé (arbre de structure,
// `/Lang`, `/ActualText`), les métadonnées et les signets. Aucun Chromium :
// la production tourne sur Vercel, qui n'en a pas, et Convex non plus.

export type ReportPdfInput = {
  locale: SiteLocale;
  year: number;
  inaugural: boolean;
  title: string;
  intro: string;
  chapters: { heading: string; body: string[] }[];
  keyFigures: { value: string; label: string }[];
};

export type ReportPdf = { bytes: Uint8Array<ArrayBuffer>; pages: number };

// Jetons du site (src/app/globals.css, thème clair) : un PDF s'imprime.
const COLOR = {
  ink: '#16191f',
  inkSoft: '#454953',
  muted: '#646771',
  accent: '#1f3d6e',
  line: '#d9d6cd',
};

const PAGE = { width: 595.28, height: 841.89 }; // A4, en points
const MARGIN = { top: 64, bottom: 72, side: 62 };
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN.side;
const BOTTOM = PAGE.height - MARGIN.bottom;

type TextStyle = {
  font: FontKey;
  size: number;
  /** Interligne, en multiple de la taille. */
  leading: number;
  color: string;
};

// L'arabe est composé un cran plus grand et plus aéré : à corps égal, son
// œil est plus petit que celui du latin, et ses hampes et jambages demandent
// l'interligne que le latin n'utilise pas.
function styles(rtl: boolean) {
  const body: FontKey = rtl ? 'arabic' : 'body';
  const bold: FontKey = rtl ? 'arabicBold' : 'bodyBold';
  const display: FontKey = rtl ? 'arabicBold' : 'display';
  return {
    eyebrow: { font: bold, size: 9, leading: 1.4, color: COLOR.muted },
    title: {
      font: display,
      size: rtl ? 28 : 30,
      leading: rtl ? 1.45 : 1.15,
      color: COLOR.ink,
    },
    intro: {
      font: body,
      size: rtl ? 13.5 : 13,
      leading: rtl ? 1.8 : 1.5,
      color: COLOR.inkSoft,
    },
    h2: {
      font: display,
      size: rtl ? 17 : 19,
      leading: rtl ? 1.6 : 1.25,
      color: COLOR.ink,
    },
    p: {
      font: body,
      size: rtl ? 11.5 : 10.5,
      leading: rtl ? 1.85 : 1.55,
      color: COLOR.inkSoft,
    },
    figureValue: {
      font: display,
      size: rtl ? 20 : 22,
      leading: 1.3,
      color: COLOR.accent,
    },
    figureLabel: {
      font: body,
      size: rtl ? 10 : 9.5,
      leading: rtl ? 1.6 : 1.4,
      color: COLOR.inkSoft,
    },
    footer: { font: body, size: 8.5, leading: 1.2, color: COLOR.muted },
  } satisfies Record<string, TextStyle>;
}

const RTL_TEXT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

// Crénage COUPÉ dans les mots arabes, et seulement là. Mesuré : Plex Sans
// Arabic écarte de 90/1000 d'em la lettre qui suit un ر (« تقرير »), et les
// extracteurs de texte (pdf.js, celui de Firefox) lisent cet écart comme une
// espace — « تقر ير ». Sans crénage, l'écart visuel perdu est d'un demi-point ;
// l'extraction, elle, rend le mot entier. Le latin garde son crénage.
type Features = PDFKit.Mixins.TextOptions['features'];
function featuresFor(text: string): Features {
  return RTL_TEXT.test(text)
    ? ({ kern: false } as unknown as Features)
    : undefined;
}

// ToUnicode des LIGATURES arabes, écrit dans l'ordre VISUEL.
//
// Le flux de contenu dessine un mot arabe dans l'ordre visuel (de gauche à
// droite, donc à rebours de la lecture) — c'est ce que produit fontkit, et ce
// que font aussi les PDF de Chromium. Les extracteurs remettent ce flux dans
// l'ordre logique en le RETOURNANT caractère par caractère. Une ligature (لا,
// لإ, تر, ين…) est un seul glyphe qui vaut deux lettres : pdfkit l'associe à
// ses lettres dans l'ordre logique, le retournement les inverse, et « الإصدار »
// se relisait « اإلصدار » (mesuré avec pdf.js). Écrire la correspondance dans
// l'ordre visuel rend le flux COHÉRENT : retourné d'un bloc, il redonne le
// texte juste. Les lecteurs qui honorent `/ActualText` (Acrobat, Poppler,
// lecteurs d'écran) lisent de toute façon le texte logique de la ligne.
//
// Accès à un champ interne de pdfkit (`_fontFamilies`, `unicode`) : le test
// « الإصدار » de render.test.ts échoue si une version de pdfkit le déplace.
function visualOrderLigatures(doc: PDFKit.PDFDocument) {
  const families = (
    doc as unknown as {
      _fontFamilies?: Record<string, { unicode?: number[][] }>;
    }
  )._fontFamilies;
  const seen = new Set<unknown>();
  for (const font of Object.values(families ?? {})) {
    // Une police est rangée sous deux clés (nom d'enregistrement et nom
    // PostScript) : la retourner deux fois l'annulerait.
    if (seen.has(font)) continue;
    seen.add(font);
    for (const cps of font.unicode ?? []) {
      if (
        cps.length > 1 &&
        cps.every((c) => RTL_TEXT.test(String.fromCodePoint(c)))
      ) {
        cps.reverse();
      }
    }
  }
}

export async function renderReportPdf(
  input: ReportPdfInput,
): Promise<ReportPdf> {
  const fonts = loadFonts();
  const rtl = isRtlLocale(input.locale);
  const base: Direction = rtl ? 'rtl' : 'ltr';
  const S = styles(rtl);
  const labels = REPORT_PDF_LABELS[input.locale];

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: MARGIN.top,
      bottom: 0,
      left: MARGIN.side,
      right: MARGIN.side,
    },
    pdfVersion: '1.7',
    // Accessibilité : PDF balisé (arbre de structure + /MarkInfo), langue du
    // document dans le catalogue, titre affiché à la place du nom de fichier.
    tagged: true,
    lang: input.locale,
    displayTitle: true,
    bufferPages: true,
    // Police par défaut = une police EMBARQUÉE : sans cela pdfkit charge
    // Helvetica depuis ses fichiers AFM, absents d'un bundle d'action.
    font: fonts.body as unknown as string,
    info: {
      Title: input.title,
      Author: labels.publisher,
      Subject: input.intro.slice(0, 500),
      Keywords: `${labels.eyebrow}, ${input.year}, ${labels.publisher}`,
      Creator: labels.publisher,
    },
  });
  for (const [key, data] of Object.entries(fonts)) doc.registerFont(key, data);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  // Une police latine n'a pas les glyphes arabes : un nom arabe dans un
  // rapport français bascule sur Plex Sans Arabic, qui porte aussi le latin.
  const fontFor = (style: TextStyle, text: string): FontKey => {
    if (rtl || !RTL_TEXT.test(text)) return style.font;
    return style.font === 'body' ? 'arabic' : 'arabicBold';
  };
  const measureWith = (style: TextStyle) => (text: string) =>
    doc
      .font(fontFor(style, text))
      .fontSize(style.size)
      .widthOfString(text, { features: featuresFor(text) });

  const root = doc.struct('Document');
  doc.addStructure(root);

  let y = MARGIN.top;
  const newPage = () => {
    doc.addPage();
    y = MARGIN.top;
  };
  const ensure = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };

  // Un bloc de texte : mots résolus, lignes coupées, chaque ligne posée dans
  // l'ordre visuel, et reliée à son élément de structure. La ligne d'un texte
  // de droite à gauche porte son texte LOGIQUE en `/ActualText` : c'est ce
  // qu'un lecteur d'écran et un copier-coller doivent restituer, quel que soit
  // l'ordre dans lequel les mots sont dessinés.
  const block = (
    element: PDFKit.PDFStructureElement,
    text: string,
    style: TextStyle,
    opts: { width?: number; x?: number; keepLines?: number } = {},
  ) => {
    const width = opts.width ?? CONTENT_WIDTH;
    const x0 = opts.x ?? MARGIN.side;
    const measure = measureWith(style);
    const spaceWidth = measure(' ');
    const lines = breakLines(tokenize(text, base), width, measure, spaceWidth);
    const lineHeight = style.size * style.leading;
    ensure(lineHeight * Math.min(lines.length, opts.keepLines ?? 2));
    for (const line of lines) {
      ensure(lineHeight);
      const placed = placeLine(line, base, width, measure, spaceWidth);
      const content = rtl
        ? doc.markStructureContent('Span', { actual: logicalText(line) })
        : doc.markStructureContent('Span');
      doc.fillColor(style.color);
      for (const piece of placed) {
        doc
          .font(fontFor(style, piece.text))
          .fontSize(style.size)
          .text(
            piece.text,
            x0 + piece.x,
            y + (lineHeight - style.size * 1.2) / 2,
            {
              lineBreak: false,
              features: featuresFor(piece.text),
            },
          );
      }
      doc.endMarkedContent();
      element.add(content);
      y += lineHeight;
    }
  };

  // Décor : jamais lu par un lecteur d'écran (artefact de mise en page).
  const artifact = (draw: () => void) => {
    doc.markContent('Artifact', { type: 'Layout' });
    draw();
    doc.endMarkedContent();
  };

  // --- Page de garde -------------------------------------------------------
  artifact(() => {
    doc.rect(0, 0, PAGE.width, 10).fill(COLOR.accent);
  });

  const eyebrow = doc.struct('P');
  root.add(eyebrow);
  const eyebrowText = input.inaugural
    ? `${labels.eyebrow} · ${input.year} · ${labels.inaugural}`
    : `${labels.eyebrow} · ${input.year}`;
  block(eyebrow, eyebrowText, S.eyebrow);
  eyebrow.end();
  y += 10;

  const h1 = doc.struct('H1');
  root.add(h1);
  block(h1, input.title, S.title);
  h1.end();
  y += 12;

  const intro = doc.struct('P');
  root.add(intro);
  block(intro, input.intro, S.intro);
  intro.end();
  y += 18;

  artifact(() => {
    doc
      .moveTo(MARGIN.side, y)
      .lineTo(PAGE.width - MARGIN.side, y)
      .lineWidth(0.75)
      .strokeColor(COLOR.line)
      .stroke();
  });
  y += 22;

  // --- Chiffres clés : une grille de trois, lue dans le sens de la langue ---
  if (input.keyFigures.length > 0) {
    const sect = doc.struct('Sect');
    root.add(sect);
    const h = doc.struct('H2');
    sect.add(h);
    block(h, labels.keyFigures, S.h2, { keepLines: 3 });
    h.end();
    y += 6;
    const list = doc.struct('L');
    sect.add(list);
    const cols = 3;
    const gutter = 16;
    const colWidth = (CONTENT_WIDTH - gutter * (cols - 1)) / cols;
    for (let i = 0; i < input.keyFigures.length; i += cols) {
      const row = input.keyFigures.slice(i, i + cols);
      const rowTop = y;
      let rowBottom = y;
      row.forEach((fig, c) => {
        const col = rtl ? cols - 1 - c : c;
        const x = MARGIN.side + col * (colWidth + gutter);
        y = rowTop;
        const li = doc.struct('LI');
        list.add(li);
        const lbl = doc.struct('Lbl');
        li.add(lbl);
        block(lbl, fig.value, S.figureValue, { width: colWidth, x });
        lbl.end();
        const lbody = doc.struct('LBody');
        li.add(lbody);
        block(lbody, fig.label, S.figureLabel, { width: colWidth, x });
        lbody.end();
        li.end();
        rowBottom = Math.max(rowBottom, y);
      });
      y = rowBottom + 14;
    }
    list.end();
    sect.end();
    y += 10;
  }

  // --- Chapitres -----------------------------------------------------------
  for (const chapter of input.chapters) {
    const sect = doc.struct('Sect');
    root.add(sect);
    y += 8;
    // Un titre ne reste jamais seul en bas de page : il emporte deux lignes
    // du paragraphe qui le suit.
    ensure(S.h2.size * S.h2.leading + 2 * S.p.size * S.p.leading);
    doc.outline.addItem(chapter.heading);
    const h = doc.struct('H2');
    sect.add(h);
    block(h, chapter.heading, S.h2);
    h.end();
    y += 6;
    for (const para of chapter.body) {
      const p = doc.struct('P');
      sect.add(p);
      block(p, para, S.p);
      p.end();
      y += S.p.size * 0.7;
    }
    sect.end();
  }

  root.end();

  // --- Pied de page, posé une fois le nombre de pages connu -----------------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.markContent('Artifact', { type: 'Pagination' });
    const footY = PAGE.height - MARGIN.bottom + 30;
    doc
      .moveTo(MARGIN.side, footY - 8)
      .lineTo(PAGE.width - MARGIN.side, footY - 8)
      .lineWidth(0.5)
      .strokeColor(COLOR.line)
      .stroke();
    const left = rtl ? pageLabel(labels, i + 1, range.count) : labels.publisher;
    const right = rtl
      ? labels.publisher
      : pageLabel(labels, i + 1, range.count);
    const footerFont = rtl ? 'arabic' : 'body';
    doc.fillColor(S.footer.color).font(footerFont).fontSize(S.footer.size);
    // La pagination arabe (« الصفحة 1 من 3 ») passe par le même placement
    // bidirectionnel que le corps : posée d'un bloc, fontkit retournerait
    // aussi ses chiffres.
    const drawAt = (text: string, align: 'left' | 'right') => {
      const measure = measureWith({ ...S.footer, font: footerFont });
      const spaceWidth = measure(' ');
      const tokens = tokenize(text, base);
      const width = measure(text) + spaceWidth * 2;
      const placed = placeLine(tokens, base, width, measure, spaceWidth);
      const x0 =
        align === 'left' ? MARGIN.side : PAGE.width - MARGIN.side - width;
      for (const piece of placed) {
        doc
          .font(fontFor(S.footer, piece.text))
          .text(piece.text, x0 + piece.x, footY, {
            lineBreak: false,
            features: featuresFor(piece.text),
          });
      }
    };
    drawAt(left, 'left');
    drawAt(right, 'right');
    doc.endMarkedContent();
  }

  visualOrderLigatures(doc);
  doc.end();
  await done;
  const all = Buffer.concat(chunks);
  const bytes = new Uint8Array(all.byteLength);
  bytes.set(all);
  return { bytes, pages: range.count };
}
