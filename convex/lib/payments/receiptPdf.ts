'use node';

import PDFDocument from 'pdfkit';
import { loadFonts, type FontKey } from '../reportPdf/fonts';
import {
  breakLines,
  logicalText,
  placeLine,
  tokenize,
  type Measure,
  type Placed,
  type Token,
} from '../reportPdf/layout';
import {
  featuresFor,
  RTL_TEXT,
  visualOrderLigatures,
} from '../reportPdf/render';
import { formatAmountFr, type Currency } from './amounts';
import type { AssociationInfo } from './config';

// PDF RECEIPT (F-29) — composed server-side by pdfkit + fontkit, in a Convex
// Node action (convex/payments/receiptsNode.ts).
//
// IN FRENCH, whatever the payer's language: it is an accounting record of the
// association, which keeps its books in French. The accompanying e-mail, on
// the other hand, is in the payer's language.
//
// BUT THE PAYER'S NAME IS THEIR OWN. Until 27/09, the receipt used the
// standard PDF fonts (Helvetica, WinAnsi encoding): "عائشة ديوب" or
// "Nguyễn Thị Ánh" printed as "????". The choice of technique that lifts this
// limit is MEASURED (docs/backlog/paiements.md § 7):
//  - pdf-lib + @pdf-lib/fontkit does embed the font, but does not apply
//    Arabic contextual shaping (every letter comes out in isolated form)
//    and reverses the whole string ("بويد ةشئاع");
//  - pdfkit + fontkit, with the bidirectional line layout and the fixes from
//    the annual report PDF (convex/lib/reportPdf), outputs joined letters and
//    extracted text in reading order. Chosen: same code, same embedded fonts
//    (no second copy), same tests.
// The trade-off is the Node runtime (pdfkit relies on Node streams and zlib):
// only the PDF COMPOSITION goes there, the receipt number is still assigned
// in the payment transaction (convex/lib/payments/ledger.ts).

export type ReceiptData = {
  number: string;
  kind: 'donation' | 'dues';
  recurring: boolean;
  amountMinor: number;
  currency: Currency;
  paidAt: number;
  payerName: string | null;
  payerEmail: string;
  provider: string;
  providerPaymentId: string;
  period: { start: number; end: number } | null;
  planLabel: string | null;
  association: AssociationInfo;
  issuedAt: number;
};

const DATE_FR = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

function dateFr(ts: number): string {
  return DATE_FR.format(ts);
}

const PROVIDER_LABEL: Record<string, string> = {
  stripe: 'Paiement en ligne par carte (Stripe)',
  fake: 'Paiement simulé (environnement de test : sans valeur comptable)',
};

const CURRENCY_NAME_FR: Record<Currency, string> = {
  EUR: 'Euro (EUR)',
  USD: 'Dollar des États-Unis (USD)',
};

// Site tokens (src/app/globals.css, light theme), the same as the report PDF.
const COLOR = { ink: '#16191f', muted: '#646771', accent: '#1f3d6e' };

const PAGE = { width: 595.28, height: 841.89 }; // A4, in points

type Weight = 'regular' | 'bold';

// IBM Plex Sans sets Latin, Greek, Cyrillic and Vietnamese; an Arabic word
// (or Persian, Urdu) switches to IBM Plex Sans Arabic.
const FONTS: Record<Weight, { latin: FontKey; arabic: FontKey }> = {
  regular: { latin: 'body', arabic: 'arabic' },
  bold: { latin: 'bodyBold', arabic: 'arabicBold' },
};

type Glyphs = { hasGlyphForCodePoint(codePoint: number): boolean };

// A font's coverage, read from the fontkit object pdfkit keeps in
// `_font.font` (internal field: the "李 → ?" test in receiptPdf.test.ts fails
// if a pdfkit version moves it). Without it, a character no font has would
// be drawn with the empty `.notdef` glyph — a silent blank instead of the "?"
// that signals the loss.
function glyphsOf(doc: PDFKit.PDFDocument, key: FontKey): Glyphs | null {
  doc.font(key);
  const font = (doc as unknown as { _font?: { font?: Partial<Glyphs> } })._font
    ?.font;
  return typeof font?.hasGlyphForCodePoint === 'function'
    ? (font as Glyphs)
    : null;
}

const INVISIBLE = /[\p{Cc}\p{Cf}]/u;

// Merges the words of a single right-to-left run into ONE chunk, placed as a
// block. `placeLine` returns them word by word, drawn right to left: pdf.js
// (Firefox's viewer) then inserts no space between them, and "عائشة ديوب"
// read back as "عائشةديوب" (measured). A run that contains ONLY Arabic words
// and their punctuation — digits and Latin text form their own runs — can be
// handed whole to fontkit, whose string reversal is then exactly the visual
// order; the spaces are drawn, and the extractor finds them. Paired
// characters have already been mirrored by `placeLine`.
function mergeRtl(placed: Placed[], measure: Measure): Placed[] {
  const out: Placed[] = [];
  for (const piece of placed) {
    const last = out[out.length - 1];
    // Within a run, the logically next word is placed TO THE LEFT of the previous
    // one, separated by nothing (attached punctuation) or by a space.
    const gap = last ? last.x - (piece.x + piece.width) : -1;
    if (last?.dir === 'rtl' && piece.dir === 'rtl' && gap > -0.01) {
      const text = `${last.text}${gap > 0.01 ? ' ' : ''}${piece.text}`;
      const width = measure(text);
      out[out.length - 1] = {
        text,
        dir: 'rtl',
        // Anchored on the RIGHT edge of the run, where reading starts.
        x: last.x + last.width - width,
        width,
      };
    } else out.push(piece);
  }
  return out;
}

export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const fonts = loadFonts();
  const a = data.association;
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    pdfVersion: '1.7',
    // Accessibility, like the reports: tagged PDF, document language, title shown
    // instead of the file name.
    tagged: true,
    lang: 'fr',
    displayTitle: true,
    // Default font = an EMBEDDED font: otherwise pdfkit loads Helvetica from its
    // AFM files, which are absent from an action bundle.
    font: fonts.body as unknown as string,
    info: {
      Title: `Reçu ${data.number}`,
      Author: a.name,
      Creator: a.name,
      CreationDate: new Date(data.issuedAt),
      ModDate: new Date(data.issuedAt),
    },
  });
  for (const key of ['body', 'bodyBold', 'arabic', 'arabicBold'] as const) {
    doc.registerFont(key, fonts[key]);
  }

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  const glyphs = Object.fromEntries(
    (['body', 'bodyBold', 'arabic', 'arabicBold'] as const).map((k) => [
      k,
      glyphsOf(doc, k),
    ]),
  ) as Record<FontKey, Glyphs | null>;
  const has = (key: FontKey, ch: string) =>
    glyphs[key]?.hasGlyphForCodePoint(ch.codePointAt(0)!) ?? true;

  // Text coming from outside (name, address, e-mail, configured legal
  // information): composed form (NFC — an "ễ" entered as a letter + two
  // combining accents has its precomposed glyph in Plex Sans), control
  // characters and invisible bidirectional marks removed (placement is done by
  // `layout`), and "?" for whatever no embedded font carries (ideographs,
  // Devanagari…: limitation documented in paiements.md § 7).
  const printable = (text: string) =>
    [...text.normalize('NFC').replace(/ᵉʳ/g, 'er')]
      .map((ch) => {
        if (/\s/u.test(ch)) return ' ';
        if (has('body', ch) || has('arabic', ch)) return ch;
        return INVISIBLE.test(ch) ? '' : '?';
      })
      .join('');

  // Font of a line chunk (already put in visual order by `placeLine`), and its
  // text reduced to that font's glyphs — a word that glues two scripts together
  // without a space cannot carry both.
  const shape = (weight: Weight, text: string) => {
    const { latin, arabic } = FONTS[weight];
    const chars = [...text];
    const key = RTL_TEXT.test(text)
      ? arabic
      : chars.every((ch) => has(latin, ch)) ||
          !chars.every((ch) => has(arabic, ch))
        ? latin
        : arabic;
    return {
      key,
      text: chars.map((ch) => (has(key, ch) ? ch : '?')).join(''),
    };
  };
  const measureWith = (weight: Weight, size: number) => (text: string) => {
    const s = shape(weight, text);
    return doc
      .font(s.key)
      .fontSize(size)
      .widthOfString(s.text, { features: featuresFor(s.text) });
  };

  const root = doc.struct('Document');
  doc.addStructure(root);

  const left = 56;
  const width = PAGE.width - left * 2;
  // BASELINE y-coordinate, measured from the BOTTOM of the page: the geometry
  // of the original pdf-lib receipt, kept as is.
  let y = 790;

  type Style = { weight?: Weight; size?: number; color?: string };

  // Places a line in visual order and links it to the structure element.
  // A line that contains Arabic carries its LOGICAL text in `/ActualText`:
  // that is what a screen reader and a copy-paste read, whatever the drawing
  // order of the words.
  const drawLine = (
    element: PDFKit.PDFStructureElement,
    line: Token[],
    x0: number,
    lineWidth: number,
    style: Required<Style>,
  ) => {
    const measure = measureWith(style.weight, style.size);
    const placed = placeLine(line, 'ltr', lineWidth, measure, measure(' '));
    const logical = logicalText(line);
    const content = RTL_TEXT.test(logical)
      ? doc.markStructureContent('Span', { actual: logical })
      : doc.markStructureContent('Span');
    doc.fillColor(style.color);
    for (const piece of mergeRtl(placed, measure)) {
      const s = shape(style.weight, piece.text);
      doc
        .font(s.key)
        .fontSize(style.size)
        .text(s.text, x0 + piece.x, PAGE.height - y, {
          lineBreak: false,
          baseline: 'alphabetic',
          features: featuresFor(s.text),
        });
    }
    doc.endMarkedContent();
    element.add(content);
  };

  const linesOf = (
    value: string,
    lineWidth: number,
    style: Required<Style>,
  ) => {
    const measure = measureWith(style.weight, style.size);
    return breakLines(
      tokenize(printable(value), 'ltr'),
      lineWidth,
      measure,
      measure(' '),
    );
  };

  const text = (
    value: string,
    opts: Style & { gap?: number; tag?: 'P' | 'H1' } = {},
  ) => {
    const style = {
      weight: opts.weight ?? 'regular',
      size: opts.size ?? 10.5,
      color: opts.color ?? COLOR.ink,
    };
    const element = doc.struct(opts.tag ?? 'P');
    root.add(element);
    for (const line of linesOf(value, width, style)) {
      drawLine(element, line, left, width, style);
      y -= style.size + 4;
    }
    element.end();
    y -= opts.gap ?? 0;
  };

  const row = (label: string, value: string) => {
    const element = doc.struct('P');
    root.add(element);
    const labelStyle = {
      weight: 'regular',
      size: 10.5,
      color: COLOR.muted,
    } as const;
    for (const line of linesOf(label, 160, labelStyle)) {
      drawLine(element, line, left, 160, labelStyle);
    }
    const valueStyle = {
      weight: 'bold',
      size: 10.5,
      color: COLOR.ink,
    } as const;
    for (const line of linesOf(value, width - 170, valueStyle)) {
      drawLine(element, line, left + 170, width - 170, valueStyle);
      y -= 15;
    }
    element.end();
    y -= 3;
  };

  // Header: the issuer.
  text(a.name, { weight: 'bold', size: 18, color: COLOR.accent, gap: 2 });
  text(a.legalForm, { size: 9.5, color: COLOR.muted });
  text(`Siège : ${a.address}`, { size: 9.5, color: COLOR.muted });
  text(`RNA : ${a.rna}${a.siret ? ` · SIRET : ${a.siret}` : ''}`, {
    size: 9.5,
    color: COLOR.muted,
  });
  text(`Représentant légal : ${a.representative}`, {
    size: 9.5,
    color: COLOR.muted,
    gap: 18,
  });

  const title =
    data.kind === 'dues'
      ? 'Reçu de cotisation'
      : data.recurring
        ? 'Reçu de don (don mensuel)'
        : 'Reçu de don';
  text(title, { weight: 'bold', size: 16, gap: 2, tag: 'H1' });
  text(`N° ${data.number}`, {
    weight: 'bold',
    size: 12,
    color: COLOR.accent,
    gap: 16,
  });

  // Decoration: never read by a screen reader (layout artifact).
  doc.markContent('Artifact', { type: 'Layout' });
  doc
    .moveTo(left, PAGE.height - (y + 6))
    .lineTo(left + width, PAGE.height - (y + 6))
    .lineWidth(0.6)
    .strokeColor(COLOR.muted)
    .stroke();
  doc.endMarkedContent();
  y -= 10;

  row(
    'Reçu de',
    data.payerName ? `${data.payerName} (${data.payerEmail})` : data.payerEmail,
  );
  row('Montant', formatAmountFr(data.amountMinor, data.currency));
  row('Devise', CURRENCY_NAME_FR[data.currency]);
  row('Date du paiement', dateFr(data.paidAt));
  row(
    'Objet',
    data.kind === 'dues'
      ? 'Cotisation annuelle d’adhésion'
      : 'Don à l’association',
  );
  if (data.planLabel) row('Formule', data.planLabel);
  if (data.period) {
    row(
      'Période couverte',
      `du ${dateFr(data.period.start)} au ${dateFr(data.period.end)}`,
    );
  }
  row('Mode de paiement', PROVIDER_LABEL[data.provider] ?? data.provider);
  row('Référence du paiement', data.providerPaymentId);
  row('Date d’émission', dateFr(data.issuedAt));
  y -= 14;

  text(
    `L’association ${a.name} certifie avoir reçu la somme indiquée ci-dessus au titre ${
      data.kind === 'dues' ? 'de la cotisation de son adhérent' : 'd’un don'
    }. Ce reçu est numéroté dans une série continue par année civile.`,
    { gap: 8 },
  );
  // The TAX receipt requires eligibility for the patronage scheme (tax ruling),
  // not obtained to date: we do not let anyone believe otherwise. And even if
  // eligible, a French tax receipt states the donation IN EUROS: a payment in
  // dollars does not qualify (the equivalent value on the payment date is
  // established by the secretariat, not by this document).
  text(
    !a.taxReceiptEligible
      ? 'Ce document atteste un paiement. Il ne constitue pas un reçu fiscal ouvrant droit à réduction d’impôt (articles 200 et 238 bis du Code général des impôts).'
      : data.currency === 'EUR'
        ? 'Ce reçu est délivré au titre des articles 200 et 238 bis du Code général des impôts.'
        : 'Ce document atteste un paiement en devise étrangère. Il ne tient pas lieu de reçu fiscal (articles 200 et 238 bis du Code général des impôts), dont le montant s’exprime en euros : le secrétariat l’établit sur demande.',
    { size: 9.5, color: COLOR.muted, gap: 8 },
  );
  if (data.provider === 'fake') {
    text('DOCUMENT DE TEST — AUCUN PAIEMENT RÉEL.', {
      weight: 'bold',
      color: COLOR.accent,
    });
  }

  root.end();
  visualOrderLigatures(doc);
  doc.end();
  await done;
  const all = Buffer.concat(chunks);
  const bytes = new Uint8Array(all.byteLength);
  bytes.set(all);
  return bytes;
}
