import { describe, it, expect } from 'vitest';
import {
  getReports,
  getReport,
  REPORT_YEARS,
  mergeReportList,
  publicReportYears,
  reportPdfFileName,
} from './reports-content';

describe('Rapports annuels (F-41)', () => {
  it('liste les rapports par année décroissante, contenu complet', () => {
    for (const loc of ['fr', 'en', 'es', 'pt', 'ar'] as const) {
      const reports = getReports(loc);
      expect(reports).toHaveLength(REPORT_YEARS.length);
      const years = reports.map((r) => r.year);
      expect(years).toEqual([...years].sort((a, b) => b - a));
      for (const r of reports) {
        expect(r.title.length).toBeGreaterThan(5);
        expect(r.intro.length).toBeGreaterThan(30);
        expect(r.chapters.length).toBeGreaterThanOrEqual(3);
        expect(r.chapters.every((s) => s.heading && s.body.length >= 1)).toBe(
          true,
        );
        // NO invented metrics: the hard-coded key figures are empty.
        expect(r.keyFigures).toEqual([]);
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
      .flatMap((r) => [
        r.title,
        r.intro,
        ...r.chapters.flatMap((s) => [s.heading, ...s.body]),
      ])
      .join('\n')
      .toLowerCase();
    expect(all).not.toContain('démocratie libérale');
  });
});

describe('Rapports : base et repli codé (F-41)', () => {
  const dbReport = {
    year: 2027,
    inaugural: false,
    title: 'Rapport 2027',
    intro: 'Deuxième année.',
  };

  it('ajoute les éditions codées que la base ne connaît pas', () => {
    const list = mergeReportList('fr', {
      reports: [dbReport],
      knownYears: [2027],
    });
    expect(list.map((r) => r.year)).toEqual([2027, 2026]);
  });

  it('une année connue de la base (même en brouillon) n’est plus servie par le code', () => {
    const list = mergeReportList('fr', { reports: [], knownYears: [2026] });
    expect(list).toEqual([]);
    expect(publicReportYears({ reports: [], knownYears: [2026] })).toEqual([]);
    expect(
      publicReportYears({ reports: [dbReport], knownYears: [2027] }),
    ).toEqual([2027, 2026]);
  });

  it('nom de fichier PDF ASCII et stable', () => {
    expect(reportPdfFileName(2026, 'ar')).toBe(
      'democracy-together-rapport-2026-ar.pdf',
    );
  });
});
