// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildReceiptPdf, type ReceiptData } from './receiptPdf';

// PDF RECEIPT (F-29) — names in every script. What these tests guarantee:
//  - the receipt OPENS (pdf.js reads it without error), on one page;
//  - an Arabic name reads back in the extracted text, WHOLE and in reading
//    order, and its letters are JOINED (contextual forms, not the isolated
//    form); a Vietnamese, Greek or Cyrillic name reads back as is;
//  - a Latin-script receipt carries EXACTLY the text of the pdf-lib receipt it
//    replaces (reference captured from the old generator on 27/09): number,
//    amount, notices.
//
// To INSPECT the generated receipts: `RECEIPT_PDF_OUT=/path pnpm exec
// vitest run convex/lib/payments/receiptPdf.test.ts` writes them to that
// directory (measurement command cited in docs/backlog/paiements.md § 7).

const OUT = process.env.RECEIPT_PDF_OUT;

const ASSOCIATION: ReceiptData['association'] = {
  name: 'Democracy Together',
  legalForm: 'Association régie par la loi du 1er juillet 1901',
  address: '12 rue de l’Exemple, 75011 Paris',
  rna: 'W751234567',
  siret: '123 456 789 00012',
  representative: 'Aïssatou Diallo, présidente',
  taxReceiptEligible: false,
};

function receipt(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    number: 'DT-2026-000042',
    kind: 'dues',
    recurring: false,
    amountMinor: 1234567,
    currency: 'EUR',
    paidAt: Date.UTC(2026, 8, 27),
    payerName: 'Jean-Luc Mélenchon-Dupré',
    payerEmail: 'jl.dupre@exemple.org',
    provider: 'stripe',
    providerPaymentId: 'pi_3PqRsTuVwXyZ0123456789',
    period: { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 11, 31) },
    planLabel: 'Individuel, pays à revenu élevé',
    association: ASSOCIATION,
    issuedAt: Date.UTC(2026, 8, 28),
    ...over,
  };
}

async function render(data: ReceiptData, file: string) {
  const bytes = await buildReceiptPdf(data);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, file), bytes);
  }
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  // pdf.js detaches the buffer it is given: we pass it a copy.
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
  }).promise;
  expect(doc.numPages).toBe(1);
  const page = await doc.getPage(1);
  // Text as pdf.js returns it (Firefox copy-paste): its own spaces between
  // chunks, a space at the end of each line.
  const items = (await page.getTextContent()).items.map((it) =>
    'str' in it ? it.str + (it.hasEOL ? ' ' : '') : '',
  );
  // Drawn glyphs, in stream order: associated Unicode text (/ToUnicode) and
  // character code (CID) — a contextually shaped Arabic letter is drawn with a
  // different glyph from its isolated form.
  const ops = await page.getOperatorList();
  const glyphs: { unicode: string; cid: number }[] = [];
  ops.fnArray.forEach((fn, k) => {
    if (fn !== pdfjs.OPS.showText) return;
    for (const g of ops.argsArray[k][0] as (
      { unicode: string; originalCharCode: number } | number
    )[]) {
      if (typeof g === 'number' || !g.unicode) continue;
      glyphs.push({ unicode: g.unicode, cid: g.originalCharCode });
    }
  });
  const info = (await doc.getMetadata()).info as Record<string, unknown>;
  await doc.destroy();
  return {
    text: items.join('').replace(/\s+/g, ' ').trim(),
    glyphs,
    info,
    size: bytes.byteLength,
  };
}

// Text extracted from the receipt produced by the OLD generator (pdf-lib,
// Helvetica) for `receipt()`, line by line: the non-regression reference.
const LATIN_REFERENCE = [
  'Democracy Together',
  'Association régie par la loi du 1er juillet 1901',
  'Siège : 12 rue de l’Exemple, 75011 Paris',
  'RNA : W751234567 · SIRET : 123 456 789 00012',
  'Représentant légal : Aïssatou Diallo, présidente',
  'Reçu de cotisation',
  'N° DT-2026-000042',
  'Reçu de Jean-Luc Mélenchon-Dupré (jl.dupre@exemple.org)',
  'Montant 12 345,67 €',
  'Devise Euro (EUR)',
  'Date du paiement 27/09/2026',
  'Objet Cotisation annuelle d’adhésion',
  'Formule Individuel, pays à revenu élevé',
  'Période couverte du 01/01/2026 au 31/12/2026',
  'Mode de paiement Paiement en ligne par carte (Stripe)',
  'Référence du paiement pi_3PqRsTuVwXyZ0123456789',
  'Date d’émission 28/09/2026',
  'L’association Democracy Together certifie avoir reçu la somme indiquée ci-dessus au titre de la',
  'cotisation de son adhérent. Ce reçu est numéroté dans une série continue par année civile.',
  'Ce document atteste un paiement. Il ne constitue pas un reçu fiscal ouvrant droit à réduction d’impôt (articles 200',
  'et 238 bis du Code général des impôts).',
].join(' ');

// Composing a PDF (decoded fonts, subsets) takes a few hundred milliseconds,
// more when the whole suite runs in parallel.
describe(
  'Reçu PDF (F-29) : noms dans toutes les écritures',
  { timeout: 60_000 },
  () => {
    it('reçu latin : texte inchangé par rapport au générateur pdf-lib', async () => {
      const { text, info } = await render(receipt(), 'recu-latin.pdf');
      expect(text).toBe(LATIN_REFERENCE);
      expect(info.Title).toBe('Reçu DT-2026-000042');
      expect(info.Author).toBe('Democracy Together');
      expect(info.Language).toBe('fr');
    });

    it('reçu latin : don mensuel, factice, fiscal — mentions conservées', async () => {
      const { text } = await render(
        receipt({
          kind: 'donation',
          recurring: true,
          currency: 'EUR',
          payerName: null,
          provider: 'fake',
          period: null,
          planLabel: null,
          association: { ...ASSOCIATION, taxReceiptEligible: true },
        }),
        'recu-latin-don.pdf',
      );
      expect(text).toContain('Reçu de don (don mensuel)');
      expect(text).toContain('Reçu de jl.dupre@exemple.org Montant');
      expect(text).toContain('12 345,67 €');
      expect(text).toContain('Euro (EUR)');
      expect(text).toContain(
        'Ce reçu est délivré au titre des articles 200 et 238 bis du Code général des impôts.',
      );
      expect(text).toContain('DOCUMENT DE TEST — AUCUN PAIEMENT RÉEL.');
      expect(text).not.toContain('?');
    });

    it('reçu en dollars : montant en « $ US », jamais présenté comme reçu fiscal', async () => {
      const { text } = await render(
        receipt({
          kind: 'donation',
          currency: 'USD',
          period: null,
          planLabel: null,
          // Even if eligible for patronage: a tax receipt states the donation in euros.
          association: { ...ASSOCIATION, taxReceiptEligible: true },
        }),
        'recu-dollars.pdf',
      );
      expect(text).toContain('Montant 12 345,67 $ US');
      expect(text).toContain('Devise Dollar des États-Unis (USD)');
      expect(text).toContain(
        'Ce document atteste un paiement en devise étrangère.',
      );
      expect(text).not.toContain('Ce reçu est délivré au titre');
      expect(text).not.toContain('?');
    });

    it('nom arabe « عائشة ديوب » : relu entier, dans l’ordre, lettres liées', async () => {
      const { text, glyphs } = await render(
        receipt({
          payerName: 'عائشة ديوب',
          // The same letters, ISOLATED, in another bold field of the same receipt:
          // this is the form they would take without contextual shaping.
          planLabel: 'ع ئ ش ي',
        }),
        'recu-arabe.pdf',
      );
      expect(text).toContain('Reçu de عائشة ديوب (jl.dupre@exemple.org)');
      expect(text).not.toContain('?');
      // No reversed word, no detached letters.
      expect(text).not.toContain('ةشئاع');
      expect(text).not.toContain('بويد');
      expect(text).not.toMatch(/ع ا ئ ش ة/u);

      // Contextual forms: in "عائشة", ع is initial, ئ initial (after ا, which does
      // not join to the left), ش medial; in "ديوب", ي is initial. Each one is
      // drawn with a different glyph from its isolated form.
      const cids = (letter: string) =>
        new Set(glyphs.filter((g) => g.unicode === letter).map((g) => g.cid));
      for (const letter of ['ع', 'ئ', 'ش', 'ي']) {
        expect(cids(letter).size, `formes de ${letter}`).toBe(2);
      }
    });

    it.each([
      ['vietnamien', 'Nguyễn Thị Ánh'],
      // Entered decomposed (letter + combining accents): recomposed when printed.
      ['vietnamien décomposé', 'Nguyễn Thị Ánh'.normalize('NFD')],
      ['grec', 'Ελένη Παπαδοπούλου'],
      ['cyrillique', 'Иван Ёлкин'],
    ])('nom %s : relu tel quel', async (_, name) => {
      const { text } = await render(
        receipt({ payerName: name }),
        `recu-${name.normalize('NFC').split(' ')[0]}.pdf`,
      );
      expect(text).toContain(
        `Reçu de ${name.normalize('NFC')} (jl.dupre@exemple.org)`,
      );
      expect(text).not.toContain('?');
    });

    it('adresse et informations configurées : même traitement que le nom', async () => {
      const { text } = await render(
        receipt({
          association: {
            ...ASSOCIATION,
            address: 'شارع الاستقلال، دكار',
            representative: 'Nguyễn Thị Ánh, présidente',
          },
        }),
        'recu-adresse.pdf',
      );
      expect(text).toContain('Siège : شارع الاستقلال، دكار');
      expect(text).toContain('Représentant légal : Nguyễn Thị Ánh, présidente');
      expect(text).not.toContain('?');
    });

    it('écriture qu’aucune police embarquée ne porte : « ? », sans échec', async () => {
      const { text } = await render(
        receipt({ payerName: 'Li 李' }),
        'recu-repli.pdf',
      );
      expect(text).toContain('Reçu de Li ? (jl.dupre@exemple.org)');
    });
  },
);
