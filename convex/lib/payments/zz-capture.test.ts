// @vitest-environment node
import { it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildReceiptPdf } from './receiptPdf';
it('capture', async () => {
  for (const [kind, name, fake, taxOk] of [
    ['dues', 'Jean-Luc Mélenchon-Dupré', false, false],
    ['donation', null, true, true],
  ] as const) {
    const bytes = await buildReceiptPdf({
      number: 'DT-2026-000042',
      kind,
      recurring: kind === 'donation',
      amountMinor: 1234567,
      currency: kind === 'dues' ? 'EUR' : 'XOF',
      paidAt: Date.UTC(2026, 8, 27),
      payerName: name,
      payerEmail: 'jl.dupre@exemple.org',
      provider: fake ? 'fake' : 'stripe',
      providerPaymentId: 'pi_3PqRsTuVwXyZ0123456789',
      period:
        kind === 'dues'
          ? { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 11, 31) }
          : null,
      planLabel: kind === 'dues' ? 'Individuel, pays à revenu élevé' : null,
      association: {
        name: 'Democracy Together',
        legalForm: 'Association régie par la loi du 1er juillet 1901',
        address: '12 rue de l’Exemple, 75011 Paris',
        rna: 'W751234567',
        siret: '123 456 789 00012',
        representative: 'Aïssatou Diallo, présidente',
        taxReceiptEligible: taxOk,
      },
      issuedAt: Date.UTC(2026, 8, 28),
    });
    const doc = await pdfjs.getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
    const tc = await (await doc.getPage(1)).getTextContent();
    const lines = new Map<number, string[]>();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      lines.set(y, [...(lines.get(y) ?? []), it.str]);
    }
    console.log(
      bytes.length,
      JSON.stringify(
        [...lines]
          .sort((a, b) => b[0] - a[0])
          .map(([y, s]) => y + ' ' + s.join(' | ')),
        null,
        1,
      ),
    );
  }
});
