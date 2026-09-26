// F-40 — Données ouvertes du Baromètre. Sérialise les données (d'illustration)
// du module `barometer-content.ts` en jeux téléchargeables CSV / JSON, plus un
// codebook texte et les géométries projetées de la carte. SOURCE UNIQUE : tout
// dérive de `barometer-content.ts` (page et exports restent cohérents). Pur /
// sans état, utilisable côté serveur (route handler) comme en test. Aucune
// donnée réelle : la mention « illustration » est reprise dans chaque export.

import type { Locale } from '@/i18n/routing';
import { getBarometerContent, MAP_DATA } from './barometer-content';
import { buildRegionShapes, MAP_W, MAP_H } from './region-geo';

// LES JEUX DE DONNÉES SUIVENT LA LANGUE DE LA PAGE, toutes langues comprises.
//
// Ce type valait `'fr' | 'en'`, et la route de téléchargement rabattait tout le
// reste sur le français : un visiteur de /es/barometre, /pt ou /ar cliquait
// « Télécharger » et recevait un CSV, un JSON et un codebook FRANÇAIS — noms de
// pays, libellés de catégorie, avertissement et prose compris — alors que la
// page qui les propose est traduite.
//
// Le rétrécissement était d'autant plus inutile que les LIGNES se localisent
// déjà seules : `compositeRows` et `dimensionRows` dérivent tout de
// `getBarometerContent(locale)`, qui accepte les cinq langues. Ne restaient en
// dur que l'étiquette de région et la prose du codebook, traitées ci-dessous.
//
// L'alias est conservé : il dit, au point d'appel, que c'est la langue du JEU
// DE DONNÉES qui est demandée — celle qui finira dans le nom du fichier servi.
export type DatasetLocale = Locale;

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

// Exhaustif par construction : une langue de plus ne compile pas sans son
// libellé, au lieu de retomber silencieusement sur le français.
const REGIONS: Record<string, Record<Locale, string>> = {
  AFR: {
    fr: 'Afrique',
    en: 'Africa',
    es: 'África',
    pt: 'África',
    ar: 'أفريقيا',
  },
  EUR: {
    fr: 'Europe',
    en: 'Europe',
    es: 'Europa',
    pt: 'Europa',
    ar: 'أوروبا',
  },
};

function regionLabel(short: string, locale: DatasetLocale): string {
  return REGIONS[short]?.[locale] ?? short;
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
    {
      meta: datasetMeta(locale, 'composite-index'),
      rows: compositeRows(locale),
    },
    null,
    2,
  );
}

export function dimensionsJSON(locale: DatasetLocale): string {
  return JSON.stringify(
    {
      meta: datasetMeta(locale, 'sub-dimensions'),
      rows: dimensionRows(locale),
    },
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
/**
 * Une phrase du codebook, dans les cinq langues.
 *
 * Ces descriptions étaient posées par `en ? '…' : '…'`, seize fois : le
 * codebook servi à /es, /pt et /ar était donc INTÉGRALEMENT français. Une table
 * indexée par la locale rend l'oubli impossible — il ne compile plus.
 */
type Phrase = Record<Locale, string>;

/** Colonnes du jeu `composite-index`. */
const COMPOSITE_COLS: readonly (readonly [string, Phrase])[] = [
  [
    'rank',
    {
      fr: 'Rang dans l’indice composite (1 = le plus haut).',
      en: 'Rank in the composite index (1 = highest).',
      es: 'Puesto en el índice compuesto (1 = el más alto).',
      pt: 'Posição no índice compósito (1 = a mais alta).',
      ar: 'الترتيب في المؤشر المركّب (1 = الأعلى).',
    },
  ],
  [
    'name_en',
    {
      fr: 'Nom du pays en anglais (identifiant stable).',
      en: 'Country name in English (stable identifier).',
      es: 'Nombre del país en inglés (identificador estable).',
      pt: 'Nome do país em inglês (identificador estável).',
      ar: 'اسم البلد بالإنجليزية (معرّف ثابت).',
    },
  ],
  [
    'country',
    {
      fr: 'Nom du pays dans la langue du jeu.',
      en: 'Country name in the dataset locale.',
      es: 'Nombre del país en el idioma del conjunto.',
      pt: 'Nome do país no idioma do conjunto.',
      ar: 'اسم البلد بلغة مجموعة البيانات.',
    },
  ],
  [
    'region',
    {
      fr: 'Afrique ou Europe.',
      en: 'Africa or Europe.',
      es: 'África o Europa.',
      pt: 'África ou Europa.',
      ar: 'أفريقيا أو أوروبا.',
    },
  ],
  [
    'index',
    {
      fr: 'Indice composite, 0–1 (plus haut = plus libre).',
      en: 'Composite index, 0–1 (higher = freer).',
      es: 'Índice compuesto, 0–1 (más alto = más libre).',
      pt: 'Índice compósito, 0–1 (mais alto = mais livre).',
      ar: 'المؤشر المركّب، 0–1 (الأعلى = الأكثر حرية).',
    },
  ],
  [
    'category',
    {
      fr: 'Catégorie 1–5 (1 = libre … 5 = non libre).',
      en: 'Category 1–5 (1 = free … 5 = not free).',
      es: 'Categoría 1–5 (1 = libre … 5 = no libre).',
      pt: 'Categoria 1–5 (1 = livre … 5 = não livre).',
      ar: 'الفئة 1–5 (1 = حرّ … 5 = غير حرّ).',
    },
  ],
  [
    'category_label',
    {
      fr: 'Libellé lisible de la catégorie.',
      en: 'Human-readable category label.',
      es: 'Etiqueta legible de la categoría.',
      pt: 'Rótulo legível da categoria.',
      ar: 'تسمية الفئة بصيغة مقروءة.',
    },
  ],
  [
    'trend_direction',
    {
      fr: 'up | down | flat par rapport à l’édition précédente.',
      en: 'up | down | flat vs. previous edition.',
      es: 'up | down | flat respecto a la edición anterior.',
      pt: 'up | down | flat face à edição anterior.',
      ar: 'up | down | flat مقارنة بالإصدار السابق.',
    },
  ],
  [
    'trend_change',
    {
      fr: 'Variation signée de l’indice vs édition précédente.',
      en: 'Signed change in the index vs. previous edition.',
      es: 'Variación con signo del índice respecto a la edición anterior.',
      pt: 'Variação com sinal do índice face à edição anterior.',
      ar: 'التغيّر المُوقَّع في المؤشر مقارنة بالإصدار السابق.',
    },
  ],
];

/** Colonnes du jeu `sub-dimensions`. */
const DIMENSION_COLS: readonly (readonly [string, Phrase])[] = [
  [
    'code',
    {
      fr: 'Code de la sous-dimension (D1–D5).',
      en: 'Sub-dimension code (D1–D5).',
      es: 'Código de la subdimensión (D1–D5).',
      pt: 'Código da subdimensão (D1–D5).',
      ar: 'رمز البعد الفرعي (D1–D5).',
    },
  ],
  [
    'dimension',
    {
      fr: 'Nom de la sous-dimension.',
      en: 'Sub-dimension name.',
      es: 'Nombre de la subdimensión.',
      pt: 'Nome da subdimensão.',
      ar: 'اسم البعد الفرعي.',
    },
  ],
  [
    'mean',
    {
      fr: 'Moyenne du panel pour la sous-dimension, 0–1.',
      en: 'Panel mean for the sub-dimension, 0–1.',
      es: 'Media del panel para la subdimensión, 0–1.',
      pt: 'Média do painel para a subdimensão, 0–1.',
      ar: 'متوسّط اللجنة للبعد الفرعي، 0–1.',
    },
  ],
  [
    'category',
    {
      fr: 'Catégorie 1–5 dérivée de la moyenne.',
      en: 'Category 1–5 derived from the mean.',
      es: 'Categoría 1–5 derivada de la media.',
      pt: 'Categoria 1–5 derivada da média.',
      ar: 'الفئة 1–5 المشتقّة من المتوسّط.',
    },
  ],
  [
    'category_label',
    {
      fr: 'Libellé lisible de la catégorie.',
      en: 'Human-readable category label.',
      es: 'Etiqueta legible de la categoría.',
      pt: 'Rótulo legível da categoria.',
      ar: 'تسمية الفئة بصيغة مقروءة.',
    },
  ],
  [
    'weight',
    {
      fr: 'Poids dans l’indice (pondération égale).',
      en: 'Weight in the composite (equal weighting).',
      es: 'Peso en el índice (ponderación igual).',
      pt: 'Peso no índice (ponderação igual).',
      ar: 'الوزن في المؤشر المركّب (ترجيح متساوٍ).',
    },
  ],
  [
    'description',
    {
      fr: 'Ce que couvre la sous-dimension.',
      en: 'What the sub-dimension covers.',
      es: 'Qué abarca la subdimensión.',
      pt: 'O que abrange a subdimensão.',
      ar: 'ما يغطّيه البعد الفرعي.',
    },
  ],
];

/** Intitulés de sections du codebook. */
const CODEBOOK_LABELS: Record<string, Phrase> = {
  source: {
    fr: 'Source',
    en: 'Source',
    es: 'Fuente',
    pt: 'Fonte',
    ar: 'المصدر',
  },
  edition: {
    fr: 'Édition',
    en: 'Edition',
    es: 'Edición',
    pt: 'Edição',
    ar: 'الإصدار',
  },
  licence: {
    fr: 'Licence',
    en: 'Licence',
    es: 'Licencia',
    pt: 'Licença',
    ar: 'الرخصة',
  },
  compositeSet: {
    fr: 'Jeu : composite-index (composite.csv / composite.json)',
    en: 'Dataset: composite-index (composite.csv / composite.json)',
    es: 'Conjunto: composite-index (composite.csv / composite.json)',
    pt: 'Conjunto: composite-index (composite.csv / composite.json)',
    ar: 'مجموعة البيانات: composite-index (composite.csv / composite.json)',
  },
  dimensionSet: {
    fr: 'Jeu : sous-dimensions (dimensions.csv / dimensions.json)',
    en: 'Dataset: sub-dimensions (dimensions.csv / dimensions.json)',
    es: 'Conjunto: subdimensiones (dimensions.csv / dimensions.json)',
    pt: 'Conjunto: subdimensões (dimensions.csv / dimensions.json)',
    ar: 'مجموعة البيانات: الأبعاد الفرعية (dimensions.csv / dimensions.json)',
  },
  method: {
    fr: 'Méthode (résumé)',
    en: 'Method (summary)',
    es: 'Método (resumen)',
    pt: 'Método (resumo)',
    ar: 'المنهجية (ملخّص)',
  },
};

export function codebook(locale: DatasetLocale): string {
  const c = getBarometerContent(locale);
  const h = (s: string) => `${s}\n${'-'.repeat(s.length)}`;
  const L = CODEBOOK_LABELS;
  const lines: string[] = [];

  lines.push(`${c.hero.title} — Codebook`);
  lines.push('');
  lines.push(`${L.source[locale]}: ${SOURCE}`);
  lines.push(`${L.edition[locale]}: ${BAROMETER_EDITION}`);
  lines.push(
    `${L.licence[locale]}: ${BAROMETER_LICENSE} — ${c.methodology.license}`,
  );
  lines.push('');
  lines.push(`!! ${c.hero.disclaimer}`);
  lines.push('');
  lines.push(h(L.compositeSet[locale]));
  for (const [k, v] of COMPOSITE_COLS)
    lines.push(`  ${k.padEnd(16)} ${v[locale]}`);
  lines.push('');
  lines.push(h(L.dimensionSet[locale]));
  for (const [k, v] of DIMENSION_COLS)
    lines.push(`  ${k.padEnd(16)} ${v[locale]}`);
  lines.push('');
  lines.push(h(L.method[locale]));
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
      return {
        body: toCSV(compositeRows(locale)),
        contentType: 'text/csv; charset=utf-8',
      };
    case 'composite.json':
      return {
        body: compositeJSON(locale),
        contentType: 'application/json; charset=utf-8',
      };
    case 'dimensions.csv':
      return {
        body: toCSV(dimensionRows(locale)),
        contentType: 'text/csv; charset=utf-8',
      };
    case 'dimensions.json':
      return {
        body: dimensionsJSON(locale),
        contentType: 'application/json; charset=utf-8',
      };
    case 'geometries.json':
      return {
        body: geometriesJSON(),
        contentType: 'application/json; charset=utf-8',
      };
    case 'codebook.txt':
      return {
        body: codebook(locale),
        contentType: 'text/plain; charset=utf-8',
      };
    default:
      return null;
  }
}
