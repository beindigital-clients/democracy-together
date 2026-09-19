import { describe, it, expect } from 'vitest';
import {
  compositeRows,
  dimensionRows,
  toCSV,
  compositeJSON,
  dimensionsJSON,
  geometriesJSON,
  codebook,
  buildDataFile,
  BAROMETER_LICENSE,
} from './barometer-dataset';

describe('Baromètre — jeu composite (F-40)', () => {
  it('produit 14 pays, rangs croissants, index numérique, name_en stable', () => {
    const fr = compositeRows('fr');
    const en = compositeRows('en');
    expect(fr).toHaveLength(14);
    expect(en).toHaveLength(14);

    // rangs 1..14 dans l'ordre
    expect(fr.map((r) => r.rank)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
    // index dans [0,1], catégorie 1..5
    for (const r of fr) {
      expect(r.index).toBeGreaterThan(0);
      expect(r.index).toBeLessThanOrEqual(1);
      expect(r.category).toBeGreaterThanOrEqual(1);
      expect(r.category).toBeLessThanOrEqual(5);
      expect(['Afrique', 'Europe']).toContain(r.region);
    }
    // identifiant stable indépendant de la locale d'affichage
    expect(fr.map((r) => r.name_en)).toEqual(en.map((r) => r.name_en));
    expect(en[0].region).toMatch(/Africa|Europe/);
  });
});

describe('Baromètre — sous-dimensions (F-40)', () => {
  it('produit 5 sous-dimensions à pondération égale (somme ≈ 1)', () => {
    const rows = dimensionRows('fr');
    expect(rows).toHaveLength(5);
    const sum = rows.reduce((a, r) => a + r.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(rows.every((r) => r.weight === 0.2)).toBe(true);
  });
});

describe('Baromètre — sérialisation CSV (RFC 4180)', () => {
  it('échappe guillemets, virgules et sauts de ligne', () => {
    const csv = toCSV([{ a: 'x,y', b: 'il a dit "ok"', c: 'l1\nl2', n: 5 }]);
    expect(csv.startsWith('a,b,c,n\r\n')).toBe(true);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"il a dit ""ok"""');
    expect(csv).toContain('"l1\nl2"');
    expect(csv.trimEnd().endsWith(',5')).toBe(true);
  });

  it('le CSV composite a un en-tête + 14 lignes de données', () => {
    const csv = toCSV(compositeRows('fr'));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(1 + 14);
    expect(lines[0]).toBe(
      'rank,name_en,country,region,index,category,category_label,trend_direction,trend_change',
    );
  });
});

describe('Baromètre — JSON & géométries (F-40)', () => {
  it('compositeJSON : méta licence/disclaimer + 14 lignes', () => {
    const obj = JSON.parse(compositeJSON('en'));
    expect(obj.meta.license).toBe(BAROMETER_LICENSE);
    expect(typeof obj.meta.disclaimer).toBe('string');
    expect(obj.meta.disclaimer.length).toBeGreaterThan(10);
    expect(obj.rows).toHaveLength(14);
  });

  it('dimensionsJSON : 5 lignes', () => {
    expect(JSON.parse(dimensionsJSON('fr')).rows).toHaveLength(5);
  });

  it('geometriesJSON : pays projetés avec tracé SVG `d`', () => {
    const obj = JSON.parse(geometriesJSON());
    expect(Array.isArray(obj.countries)).toBe(true);
    expect(obj.countries.length).toBeGreaterThan(20);
    for (const c of obj.countries.slice(0, 5)) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.d).toBe('string');
      expect(c.d.length).toBeGreaterThan(0);
    }
  });
});

describe('Baromètre — codebook & dispatch (F-40)', () => {
  it('le codebook décrit les colonnes, la licence et le disclaimer', () => {
    const cb = codebook('fr');
    expect(cb).toContain(BAROMETER_LICENSE);
    expect(cb).toContain('trend_direction');
    expect(cb).toContain('weight');
    expect(cb.toLowerCase()).toContain('illustration');
  });

  it('buildDataFile : type MIME correct, null si inconnu', () => {
    expect(buildDataFile('composite.csv', 'fr')?.contentType).toBe(
      'text/csv; charset=utf-8',
    );
    expect(buildDataFile('composite.json', 'fr')?.contentType).toBe(
      'application/json; charset=utf-8',
    );
    expect(buildDataFile('geometries.json', 'en')?.contentType).toBe(
      'application/json; charset=utf-8',
    );
    expect(buildDataFile('codebook.txt', 'fr')?.contentType).toBe(
      'text/plain; charset=utf-8',
    );
    expect(buildDataFile('inconnu.xml', 'fr')).toBeNull();
  });

  it('AUCUN terme banni dans les exports (FR + EN)', () => {
    const all = [
      compositeJSON('fr'),
      compositeJSON('en'),
      dimensionsJSON('fr'),
      dimensionsJSON('en'),
      geometriesJSON(),
      codebook('fr'),
      codebook('en'),
      toCSV(compositeRows('fr')),
      toCSV(compositeRows('en')),
    ].join('\n');
    expect(all.toLowerCase()).not.toContain('démocratie libérale');
  });
});
