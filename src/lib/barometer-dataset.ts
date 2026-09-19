// F-40 — Données ouvertes du Baromètre. Sérialise les données (d'illustration)
// du module `barometer-content.ts` en jeux téléchargeables CSV / JSON, plus un
// codebook texte et les géométries projetées de la carte. SOURCE UNIQUE : tout
// dérive de `barometer-content.ts` (page et exports restent cohérents). Pur /
// sans état, utilisable côté serveur (route handler) comme en test. Aucune
// donnée réelle : la mention « illustration » est reprise dans chaque export.

import { getBarometerContent, MAP_DATA } from './barometer-content';
import { buildRegionShapes, MAP_W, MAP_H } from './region-geo';

export type DatasetLocale = 'fr' | 'en';

export const BAROMETER_EDITION = '2026';
export const BAROMETER_LICENSE = 'CC-BY-4.0';
const SOURCE = 'Democracy Together — Baromètre de la démocratie';

export const DATA_FILES = [
  'composite.csv',
  'composite.json',
  'dimensions.csv',
  'dimensions.json',
  'geometries.json',
  'codebook.txt',
] as const;
export type DataFile = (typeof DATA_FILES)[number];

function regionLabel(short: string, locale: DatasetLocale): string {
  if (short === 'AFR') return locale === 'en' ? 'Africa' : 'Afrique';
  if (short === 'EUR') return 'Europe';
  return short;
}

// --- Jeu 1 : indice composite, une ligne par pays --------------------------
export type CompositeRow = {
  rank: number;
  name_en: string;
  country: string;
  region: string;
  index: number;
  category: number;
  category_label: string;
  trend_direction: 'up' | 'down' | 'flat';
  trend_change: string;
};

export function compositeRows(locale: DatasetLocale): CompositeRow[] {
  const c = getBarometerContent(locale);
  const en = getBarometerContent('en');
  return c.ranking.rows.map((r, i) => ({
    rank: Number.parseInt(r.pos, 10),
    name_en: en.ranking.rows[i].country,
    country: r.country,
    region: regionLabel(r.region, locale),
    index: Number.parseFloat(r.index),
    category: r.cat,
    category_label: c.legend[r.cat - 1].label,
    trend_direction: r.trend.dir,
    trend_change: r.trend.value,
  }));
}

// --- Jeu 2 : sous-dimensions (pondérations égales) -------------------------
export type DimensionRow = {
  code: string;
  dimension: string;
  mean: number;
  category: number;
  category_label: string;
  weight: number;
  description: string;
};

export function dimensionRows(locale: DatasetLocale): DimensionRow[] {
  const c = getBarometerContent(locale);
  // Méthodologie : pondération égale entre les sous-dimensions.
  const weight = Number((1 / c.dimensions.items.length).toFixed(4));
  return c.dimensions.items.map((d) => ({
    code: d.ix,
    dimension: d.title,
    mean: Number.parseFloat(d.mean),
    category: d.cat,
    category_label: c.legend[d.cat - 1].label,
    weight,
    description: d.body,
  }));
}

// --- CSV (RFC 4180) ---------------------------------------------------------
function csvCell(v: unknown): string {
  // Sérialiseur générique : la coercition de `unknown` est ici l'intention, et
  // les seules valeurs passées (cf. toDatasetRows) sont des chaînes et des
  // nombres. Un `JSON.stringify` sur les objets changerait le format du fichier
  // publié.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

// --- JSON (métadonnées + lignes) -------------------------------------------
export function datasetMeta(locale: DatasetLocale, dataset: string) {
  const c = getBarometerContent(locale);
  return {
    source: SOURCE,
    dataset,
    edition: BAROMETER_EDITION,
    license: BAROMETER_LICENSE,
    locale,
    disclaimer: c.hero.disclaimer,
  };
}

export function compositeJSON(locale: DatasetLocale): string {
  return JSON.stringify(
    { meta: datasetMeta(locale, 'composite-index'), rows: compositeRows(locale) },
    null,
    2,
  );
}

export function dimensionsJSON(locale: DatasetLocale): string {
  return JSON.stringify(
    { meta: datasetMeta(locale, 'sub-dimensions'), rows: dimensionRows(locale) },
    null,
    2,
  );
}

// --- Géométries projetées de la carte (telles qu'affichées sur le site) ----
export function geometriesJSON(): string {
  const shapes = buildRegionShapes();
  const region = new Map(MAP_DATA.map((d) => [d.name, d.region]));
  return JSON.stringify(
    {
      meta: {
        source: SOURCE,
        dataset: 'map-geometries',
        license: BAROMETER_LICENSE,
        projection: 'mercator, fitted to Africa–Europe',
        viewBox: { width: MAP_W, height: MAP_H },
        note: 'Projected SVG path data (attribute "d") per country outline, as rendered on the barometer map. Derived from world-atlas countries-110m.',
      },
      countries: shapes.map((s) => ({
        name: s.name,
        region: region.get(s.name) ?? null,
        d: s.d,
      })),
    },
    null,
    2,
  );
}

// --- Codebook (texte brut, lisible) ----------------------------------------
export function codebook(locale: DatasetLocale): string {
  const c = getBarometerContent(locale);
  const en = locale === 'en';
  const h = (s: string) => `${s}\n${'-'.repeat(s.length)}`;
  const compositeCols = [
    ['rank', en ? 'Rank in the composite index (1 = highest).' : "Rang dans l'indice composite (1 = le plus haut)."],
    ['name_en', en ? 'Country name in English (stable identifier).' : 'Nom du pays en anglais (identifiant stable).'],
    ['country', en ? 'Country name in the dataset locale.' : 'Nom du pays dans la langue du jeu.'],
    ['region', en ? 'Africa or Europe.' : 'Afrique ou Europe.'],
    ['index', en ? 'Composite index, 0–1 (higher = freer).' : 'Indice composite, 0–1 (plus haut = plus libre).'],
    ['category', en ? 'Category 1–5 (1 = free … 5 = not free).' : 'Catégorie 1–5 (1 = libre … 5 = non libre).'],
    ['category_label', en ? 'Human-readable category label.' : 'Libellé lisible de la catégorie.'],
    ['trend_direction', en ? 'up | down | flat vs. previous edition.' : 'up | down | flat par rapport à l’édition précédente.'],
    ['trend_change', en ? 'Signed change in the index vs. previous edition.' : "Variation signée de l'indice vs édition précédente."],
  ];
  const dimensionCols = [
    ['code', en ? 'Sub-dimension code (D1–D5).' : 'Code de la sous-dimension (D1–D5).'],
    ['dimension', en ? 'Sub-dimension name.' : 'Nom de la sous-dimension.'],
    ['mean', en ? 'Panel mean for the sub-dimension, 0–1.' : 'Moyenne du panel pour la sous-dimension, 0–1.'],
    ['category', en ? 'Category 1–5 derived from the mean.' : 'Catégorie 1–5 dérivée de la moyenne.'],
    ['category_label', en ? 'Human-readable category label.' : 'Libellé lisible de la catégorie.'],
    ['weight', en ? 'Weight in the composite (equal weighting).' : "Poids dans l'indice (pondération égale)."],
    ['description', en ? 'What the sub-dimension covers.' : 'Ce que couvre la sous-dimension.'],
  ];
  const lines: string[] = [];
  lines.push(c.hero.title + (en ? ' — Codebook' : ' — Codebook'));
  lines.push('');
  lines.push(`${en ? 'Source' : 'Source'}: ${SOURCE}`);
  lines.push(`${en ? 'Edition' : 'Édition'}: ${BAROMETER_EDITION}`);
  lines.push(`${en ? 'Licence' : 'Licence'}: ${BAROMETER_LICENSE} — ${c.methodology.license}`);
  lines.push('');
  lines.push(`!! ${c.hero.disclaimer}`);
  lines.push('');
  lines.push(h(en ? 'Dataset: composite-index (composite.csv / composite.json)' : 'Jeu : composite-index (composite.csv / composite.json)'));
  for (const [k, v] of compositeCols) lines.push(`  ${k.padEnd(16)} ${v}`);
  lines.push('');
  lines.push(h(en ? 'Dataset: sub-dimensions (dimensions.csv / dimensions.json)' : 'Jeu : sous-dimensions (dimensions.csv / dimensions.json)'));
  for (const [k, v] of dimensionCols) lines.push(`  ${k.padEnd(16)} ${v}`);
  lines.push('');
  lines.push(h(en ? 'Method (summary)' : 'Méthode (résumé)'));
  c.methodology.steps.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.title} — ${s.body}`);
  });
  lines.push('');
  return lines.join('\n');
}

// Construit le corps + le type MIME d'un fichier de données. `null` = inconnu.
export function buildDataFile(
  file: string,
  locale: DatasetLocale,
): { body: string; contentType: string } | null {
  switch (file) {
    case 'composite.csv':
      return { body: toCSV(compositeRows(locale)), contentType: 'text/csv; charset=utf-8' };
    case 'composite.json':
      return { body: compositeJSON(locale), contentType: 'application/json; charset=utf-8' };
    case 'dimensions.csv':
      return { body: toCSV(dimensionRows(locale)), contentType: 'text/csv; charset=utf-8' };
    case 'dimensions.json':
      return { body: dimensionsJSON(locale), contentType: 'application/json; charset=utf-8' };
    case 'geometries.json':
      return { body: geometriesJSON(), contentType: 'application/json; charset=utf-8' };
    case 'codebook.txt':
      return { body: codebook(locale), contentType: 'text/plain; charset=utf-8' };
    default:
      return null;
  }
}
