// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildReceiptPdf, type ReceiptData } from './receiptPdf';

// REÇU PDF (F-29) — noms dans toutes les écritures. Ce que ces tests tiennent :
//  - le reçu S'OUVRE (pdf.js le lit sans erreur), sur une page ;
//  - un nom arabe se relit dans le texte extrait, ENTIER et dans l'ordre de
//    lecture, et ses lettres sont LIÉES (formes contextuelles, pas la forme
//    isolée) ; un nom vietnamien, grec ou cyrillique se relit tel quel ;
//  - un reçu latin porte EXACTEMENT le texte du reçu pdf-lib qu'il remplace
//    (référence relevée sur l'ancien générateur le 27/09) : numéro, montant,
//    mentions.
//
// Pour INSPECTER les reçus produits : `RECEIPT_PDF_OUT=/chemin pnpm exec
// vitest run convex/lib/payments/receiptPdf.test.ts` les écrit dans ce
// dossier (commande de mesure citée dans docs/backlog/paiements.md § 7).

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
  // pdf.js détache le tampon qu'on lui passe : on lui donne une copie.
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  expect(doc.numPages).toBe(1);
  const page = await doc.getPage(1);
  // Texte tel que pdf.js le restitue (copier-coller de Firefox) : ses
  // propres espaces entre les morceaux, une espace à chaque fin de ligne.
  const items = (await page.getTextContent()).items.map((it) =>
    'str' in it ? it.str + (it.hasEOL ? ' ' : '') : '',
  );
  // Glyphes dessinés, dans l'ordre du flux : texte Unicode associé
  // (/ToUnicode) et code de caractère (CID) — une lettre arabe mise en forme
  // contextuellement est dessinée par un autre glyphe que sa forme isolée.
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
  const { info } = (await doc.getMetadata()) as {
    info: Record<string, unknown>;
  };
  await doc.destroy();
  return {
    text: items.join('').replace(/\s+/g, ' ').trim(),
    glyphs,
    info,
    size: bytes.byteLength,
  };
}

// Texte extrait du reçu produit par l'ANCIEN générateur (pdf-lib, Helvetica)
// pour `receipt()`, ligne par ligne : la référence de non-régression.
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

// Composer un PDF (polices décodées, sous-ensembles) prend quelques centaines
// de millisecondes, davantage quand toute la suite tourne en parallèle.
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
          // Même éligible au mécénat : un reçu fiscal chiffre le don en euros.
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
          // Les mêmes lettres, ISOLÉES, dans un autre champ en gras du même
          // reçu : c'est la forme qu'elles prendraient sans mise en forme
          // contextuelle.
          planLabel: 'ع ئ ش ي',
        }),
        'recu-arabe.pdf',
      );
      expect(text).toContain('Reçu de عائشة ديوب (jl.dupre@exemple.org)');
      expect(text).not.toContain('?');
      // Ni mot retourné, ni lettres détachées.
      expect(text).not.toContain('ةشئاع');
      expect(text).not.toContain('بويد');
      expect(text).not.toMatch(/ع ا ئ ش ة/u);

      // Formes contextuelles : dans « عائشة », ع est initiale, ئ initiale
      // (après ا, qui ne se lie pas à gauche), ش médiane ; dans « ديوب », ي est
      // initiale. Chacune est dessinée par un autre glyphe que sa forme isolée.
      const cids = (letter: string) =>
        new Set(glyphs.filter((g) => g.unicode === letter).map((g) => g.cid));
      for (const letter of ['ع', 'ئ', 'ش', 'ي']) {
        expect(cids(letter).size, `formes de ${letter}`).toBe(2);
      }
    });

    it.each([
      ['vietnamien', 'Nguyễn Thị Ánh'],
      // Saisi décomposé (lettre + accents combinants) : recomposé à l'impression.
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
