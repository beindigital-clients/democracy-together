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

// REÇU PDF (F-29) — composé côté serveur par pdfkit + fontkit, dans une
// action Convex Node (convex/payments/receiptsNode.ts).
//
// EN FRANÇAIS, quelle que soit la langue du payeur : c'est une pièce
// comptable de l'association, qui tient sa comptabilité en français. Le
// courriel qui l'accompagne, lui, est dans la langue du payeur.
//
// MAIS LE NOM DU PAYEUR EST LE SIEN. Jusqu'au 27/09, le reçu employait les
// polices standard du PDF (Helvetica, encodage WinAnsi) : « عائشة ديوب » ou
// « Nguyễn Thị Ánh » s'imprimaient « ???? ». Le choix de la technique qui
// lève cette limite est MESURÉ (docs/backlog/paiements.md § 7) :
//  - pdf-lib + @pdf-lib/fontkit embarque bien la police, mais n'applique pas
//    la mise en forme contextuelle arabe (chaque lettre sort en forme isolée)
//    et retourne toute la chaîne (« بويد ةشئاع ») ;
//  - pdfkit + fontkit, avec la mise en ligne bidirectionnelle et les
//    corrections du PDF des rapports annuels (convex/lib/reportPdf), sort les
//    lettres liées et un texte extrait dans l'ordre de lecture. Retenu : même
//    code, mêmes polices embarquées (aucune seconde copie), mêmes tests.
// La contrepartie est le runtime Node (pdfkit s'appuie sur les flux et zlib de
// Node) : seule la COMPOSITION du PDF y va, le numéro du reçu reste attribué
// dans la transaction du paiement (convex/lib/payments/ledger.ts).

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

// Jetons du site (src/app/globals.css, thème clair), ceux du PDF des rapports.
const COLOR = { ink: '#16191f', muted: '#646771', accent: '#1f3d6e' };

const PAGE = { width: 595.28, height: 841.89 }; // A4, en points

type Weight = 'regular' | 'bold';

// IBM Plex Sans compose le latin, le grec, le cyrillique et le vietnamien ;
// un mot arabe (ou persan, ourdou) bascule sur IBM Plex Sans Arabic.
const FONTS: Record<Weight, { latin: FontKey; arabic: FontKey }> = {
  regular: { latin: 'body', arabic: 'arabic' },
  bold: { latin: 'bodyBold', arabic: 'arabicBold' },
};

type Glyphs = { hasGlyphForCodePoint(codePoint: number): boolean };

// Couverture d'une police, lue sur l'objet fontkit que pdfkit garde en
// `_font.font` (champ interne : le test « 李 → ? » de receiptPdf.test.ts
// échoue si une version de pdfkit le déplace). Sans elle, un caractère
// qu'aucune police n'a serait dessiné par le glyphe vide `.notdef` — un blanc
// muet au lieu du « ? » qui signale la perte.
function glyphsOf(doc: PDFKit.PDFDocument, key: FontKey): Glyphs | null {
  doc.font(key);
  const font = (doc as unknown as { _font?: { font?: Partial<Glyphs> } })._font
    ?.font;
  return typeof font?.hasGlyphForCodePoint === 'function'
    ? (font as Glyphs)
    : null;
}

const INVISIBLE = /[\p{Cc}\p{Cf}]/u;

// Réunit les mots d'une même course droite-à-gauche en UN morceau, posé d'un
// bloc. `placeLine` les rend mot par mot, dessinés de droite à gauche : pdf.js
// (le lecteur de Firefox) n'insère alors aucune espace entre eux, et
// « عائشة ديوب » se relisait « عائشةديوب » (mesuré). Une course qui ne
// contient QUE des mots arabes et leur ponctuation — les chiffres et le latin
// forment leurs propres courses — peut être confiée entière à fontkit, dont
// le retournement de la chaîne est alors exactement l'ordre visuel ; les
// espaces sont dessinées, et l'extracteur les retrouve. Les signes appariés
// ont déjà été mis en miroir par `placeLine`.
function mergeRtl(placed: Placed[], measure: Measure): Placed[] {
  const out: Placed[] = [];
  for (const piece of placed) {
    const last = out[out.length - 1];
    // Dans une course, le mot logiquement suivant est posé À GAUCHE du
    // précédent, séparé de rien (ponctuation collée) ou d'une espace.
    const gap = last ? last.x - (piece.x + piece.width) : -1;
    if (last?.dir === 'rtl' && piece.dir === 'rtl' && gap > -0.01) {
      const text = `${last.text}${gap > 0.01 ? ' ' : ''}${piece.text}`;
      const width = measure(text);
      out[out.length - 1] = {
        text,
        dir: 'rtl',
        // Ancré sur le bord DROIT de la course, là où la lecture commence.
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
    // Accessibilité, comme les rapports : PDF balisé, langue du document,
    // titre affiché à la place du nom de fichier.
    tagged: true,
    lang: 'fr',
    displayTitle: true,
    // Police par défaut = une police EMBARQUÉE : sans cela pdfkit charge
    // Helvetica depuis ses fichiers AFM, absents d'un bundle d'action.
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

  // Texte venu de l'extérieur (nom, adresse, e-mail, informations légales
  // configurées) : forme composée (NFC — un « ễ » saisi en lettre + deux
  // accents combinants a son glyphe précomposé dans Plex Sans), caractères
  // de contrôle et marques bidirectionnelles invisibles retirés (le placement
  // est fait par `layout`), et « ? » pour ce qu'aucune police embarquée ne
  // porte (idéogrammes, devanagari… : limite écrite dans paiements.md § 7).
  const printable = (text: string) =>
    [...text.normalize('NFC').replace(/ᵉʳ/g, 'er')]
      .map((ch) => {
        if (/\s/u.test(ch)) return ' ';
        if (has('body', ch) || has('arabic', ch)) return ch;
        return INVISIBLE.test(ch) ? '' : '?';
      })
      .join('');

  // Police d'un morceau de ligne (déjà mis dans l'ordre visuel par
  // `placeLine`), et son texte ramené aux glyphes de cette police — un mot
  // qui colle deux écritures sans espace ne peut pas en porter deux.
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
  // Ordonnée de la LIGNE DE BASE, comptée depuis le BAS de la page : la
  // géométrie du reçu pdf-lib d'origine, reprise telle quelle.
  let y = 790;

  type Style = { weight?: Weight; size?: number; color?: string };

  // Pose une ligne dans l'ordre visuel et la relie à l'élément de structure.
  // Une ligne qui contient de l'arabe porte son texte LOGIQUE en
  // `/ActualText` : c'est ce que lisent un lecteur d'écran et un
  // copier-coller, quel que soit l'ordre de dessin des mots.
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

  // En-tête : l'émetteur.
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

  // Décor : jamais lu par un lecteur d'écran (artefact de mise en page).
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
  // Le reçu FISCAL suppose l'éligibilité au régime du mécénat (rescrit), non
  // acquise à ce jour : on ne le laisse pas croire. Et même éligible, un reçu
  // fiscal français chiffre le don EN EUROS : un paiement en dollars n'en
  // tient pas lieu (la contre-valeur au jour du paiement est établie par le
  // secrétariat, pas par ce document).
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
