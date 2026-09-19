import { describe, it, expect } from 'vitest';
import { getLegalContent, type LegalKind } from '@/lib/legal-content';

const KINDS: LegalKind[] = ['mentions', 'confidentialite', 'accessibilite'];
const LOCALES = ['fr', 'en'] as const;

describe('Contenu légal (F-09)', () => {
  it('fournit FR et EN pour chaque page, avec des sections non vides', () => {
    for (const kind of KINDS) {
      for (const locale of LOCALES) {
        const doc = getLegalContent(kind, locale);
        expect(doc.title.length).toBeGreaterThan(0);
        expect(doc.intro.length).toBeGreaterThan(0);
        expect(doc.sections.length).toBeGreaterThanOrEqual(3);
        for (const s of doc.sections) {
          expect(s.heading.length).toBeGreaterThan(0);
          expect(s.body.length).toBeGreaterThan(0);
          expect(s.body.every((p) => p.trim().length > 0)).toBe(true);
        }
      }
    }
  });

  it('replie sur le français pour une locale inconnue', () => {
    expect(getLegalContent('mentions', 'de').title).toBe(
      getLegalContent('mentions', 'fr').title,
    );
  });

  it('ne contient jamais le terme banni ni l’ancienne marque', () => {
    for (const kind of KINDS) {
      for (const locale of LOCALES) {
        const blob = JSON.stringify(
          getLegalContent(kind, locale),
        ).toLowerCase();
        expect(blob).not.toContain('démocratie libérale');
        expect(blob).not.toContain('democratie liberale');
        expect(blob).not.toContain('rmdl');
      }
    }
  });

  it('marque explicitement les éléments à compléter (aucune fabrication)', () => {
    // Mentions légales : éditeur / directeur / RNA non confirmés -> à compléter.
    const blob = JSON.stringify(
      getLegalContent('mentions', 'fr'),
    ).toLowerCase();
    expect(blob).toContain('à compléter');
    expect(JSON.stringify(getLegalContent('mentions', 'en'))).toContain(
      'to be completed',
    );
  });

  it('la politique de confidentialité couvre les sections RGPD clés', () => {
    const headings = getLegalContent('confidentialite', 'fr').sections.map(
      (s) => s.heading.toLowerCase(),
    );
    expect(headings.some((h) => h.includes('cookies'))).toBe(true);
    expect(headings.some((h) => h.includes('droits'))).toBe(true);
    expect(headings.some((h) => h.includes('conservation'))).toBe(true);
    expect(headings.some((h) => h.includes('sous-traitants'))).toBe(true);
  });
});
