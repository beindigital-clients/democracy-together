import { describe, it, expect } from 'vitest';
import { getReports, getReport, REPORT_YEARS } from './reports-content';

describe('Rapports annuels (F-41)', () => {
  it('liste les rapports par année décroissante, contenu complet', () => {
    for (const loc of ['fr', 'en'] as const) {
      const reports = getReports(loc);
      expect(reports).toHaveLength(REPORT_YEARS.length);
      // ordre décroissant
      const years = reports.map((r) => r.year);
      expect(years).toEqual([...years].sort((a, b) => b - a));
      for (const r of reports) {
        expect(r.title.length).toBeGreaterThan(5);
        expect(r.intro.length).toBeGreaterThan(30);
        expect(r.sections.length).toBeGreaterThanOrEqual(3);
        expect(r.sections.every((s) => s.heading && s.body.length >= 1)).toBe(
          true,
        );
      }
    }
  });

  it("2026 est l'édition inaugurale", () => {
    expect(getReport('fr', 2026)?.inaugural).toBe(true);
    expect(getReport('en', 2026)?.year).toBe(2026);
  });

  it('renvoie null pour une année absente', () => {
    expect(getReport('fr', 1999)).toBeNull();
    expect(getReport('en', 2099)).toBeNull();
  });

  it('aucun terme banni dans le contenu (FR + EN)', () => {
    const all = (['fr', 'en'] as const)
      .flatMap((loc) => getReports(loc))
      .flatMap((r) => [r.title, r.intro, ...r.sections.flatMap((s) => [s.heading, ...s.body])])
      .join('\n')
      .toLowerCase();
    expect(all).not.toContain('démocratie libérale');
  });
});
