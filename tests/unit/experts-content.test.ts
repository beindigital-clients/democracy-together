import { describe, it, expect } from 'vitest';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// F-23 — Annuaire d'experts : garde-fous sur le contenu i18n créé pour la
// feature (namespace `experts` + clé de pied de page `footer.col2f`).
describe('experts i18n (F-23)', () => {
  it('le namespace `experts` existe avec les mêmes clés FR/EN', () => {
    const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
    expect(fr.experts).toBeDefined();
    expect(en.experts).toBeDefined();
    expect(keys(fr.experts)).toEqual(keys(en.experts));
    // Les clés attendues par la page serveur.
    for (const k of [
      'metaTitle',
      'metaDescription',
      'eyebrow',
      'title',
      'lead',
      'empty',
      'count',
    ]) {
      expect(fr.experts).toHaveProperty(k);
      expect(en.experts).toHaveProperty(k);
    }
    // Lien de pied de page (colonne « Analyses »).
    expect(fr.footer).toHaveProperty('col2f');
    expect(en.footer).toHaveProperty('col2f');
  });

  it('ne contient jamais le terme banni (FR & EN)', () => {
    for (const messages of [fr, en]) {
      const blob = JSON.stringify(messages.experts).toLowerCase();
      expect(blob).not.toContain('démocratie libérale');
      expect(blob).not.toContain('liberal democracy');
    }
  });
});
