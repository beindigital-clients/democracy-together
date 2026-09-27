import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { formatAmountFr, type Currency } from './amounts';
import type { AssociationInfo } from './config';

// REÇU PDF (F-29) — généré côté serveur, en JavaScript pur (pdf-lib : aucune
// dépendance native, s'exécute dans le runtime Convex par défaut).
//
// EN FRANÇAIS, quelle que soit la langue du payeur : c'est une pièce
// comptable de l'association, qui tient sa comptabilité en français. Le
// courriel qui l'accompagne, lui, est dans la langue du payeur.
//
// POLICES STANDARD (Helvetica) : rien à embarquer, un reçu de quelques Ko. Leur
// encodage (WinAnsi) couvre le français — accents, « € », guillemets — mais pas
// l'arabe ni l'espace fine insécable. Tout texte venu de l'extérieur (nom du
// payeur) passe donc par `winAnsiSafe` : un caractère non représentable
// devient « ? » plutôt que de faire échouer la génération du reçu.

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

// Caractères hors WinAnsi (CP1252) remplacés. Le tableau couvre les
// substitutions typographiques courantes avant le repli « ? ».
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

export function winAnsiSafe(text: string): string {
  return text
    .replace(/[\u202F\u2009\u2007]/g, ' ')
    .replace(/[\u2010\u2011]/g, '-')
    .replace(/ᵉʳ/g, 'er')
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e) return ch;
      if (code >= 0xa0 && code <= 0xff) return ch;
      if (WINANSI_EXTRA.has(ch)) return ch;
      return '?';
    })
    .join('');
}

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
  paydunya: 'Paiement en ligne (PayDunya : mobile money ou carte)',
  fake: 'Paiement simulé (environnement de test : sans valeur comptable)',
};

// Découpe un texte en lignes qui tiennent dans `width`.
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsiSafe(`Reçu ${data.number}`));
  pdf.setAuthor(winAnsiSafe(data.association.name));
  pdf.setCreationDate(new Date(data.issuedAt));
  pdf.setModificationDate(new Date(data.issuedAt));
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.086, 0.098, 0.122);
  const muted = rgb(0.39, 0.4, 0.44);
  const accent = rgb(0.122, 0.239, 0.431);
  const left = 56;
  const width = 595.28 - left * 2;
  let y = 790;

  const text = (
    value: string,
    opts: {
      font?: PDFFont;
      size?: number;
      color?: typeof ink;
      gap?: number;
    } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    for (const line of wrap(winAnsiSafe(value), font, size, width)) {
      page.drawText(line, { x: left, y, size, font, color: opts.color ?? ink });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  const row = (label: string, value: string) => {
    page.drawText(winAnsiSafe(label), {
      x: left,
      y,
      size: 10.5,
      font: regular,
      color: muted,
    });
    const lines = wrap(winAnsiSafe(value), bold, 10.5, width - 170);
    for (const line of lines) {
      page.drawText(line, {
        x: left + 170,
        y,
        size: 10.5,
        font: bold,
        color: ink,
      });
      y -= 15;
    }
    y -= 3;
  };

  const a = data.association;
  // En-tête : l'émetteur.
  text(a.name, { font: bold, size: 18, color: accent, gap: 2 });
  text(a.legalForm, { size: 9.5, color: muted });
  text(`Siège : ${a.address}`, { size: 9.5, color: muted });
  text(`RNA : ${a.rna}${a.siret ? ` · SIRET : ${a.siret}` : ''}`, {
    size: 9.5,
    color: muted,
  });
  text(`Représentant légal : ${a.representative}`, {
    size: 9.5,
    color: muted,
    gap: 18,
  });

  const title =
    data.kind === 'dues'
      ? 'Reçu de cotisation'
      : data.recurring
        ? 'Reçu de don (don mensuel)'
        : 'Reçu de don';
  text(title, { font: bold, size: 16, gap: 2 });
  text(`N° ${data.number}`, { font: bold, size: 12, color: accent, gap: 16 });

  page.drawLine({
    start: { x: left, y: y + 6 },
    end: { x: left + width, y: y + 6 },
    thickness: 0.6,
    color: muted,
  });
  y -= 10;

  row(
    'Reçu de',
    data.payerName ? `${data.payerName} (${data.payerEmail})` : data.payerEmail,
  );
  row('Montant', formatAmountFr(data.amountMinor, data.currency));
  row(
    'Devise',
    data.currency === 'EUR' ? 'Euro (EUR)' : 'Franc CFA BCEAO (XOF)',
  );
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
  // acquise à ce jour : on ne le laisse pas croire.
  text(
    a.taxReceiptEligible
      ? 'Ce reçu est délivré au titre des articles 200 et 238 bis du Code général des impôts.'
      : 'Ce document atteste un paiement. Il ne constitue pas un reçu fiscal ouvrant droit à réduction d’impôt (articles 200 et 238 bis du Code général des impôts).',
    { size: 9.5, color: muted, gap: 8 },
  );
  if (data.provider === 'fake') {
    text('DOCUMENT DE TEST — AUCUN PAIEMENT RÉEL.', {
      font: bold,
      color: accent,
    });
  }

  return await pdf.save({ useObjectStreams: false });
}
