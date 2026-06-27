// Convertit un code pays ISO 3166-1 alpha-2 en libellé world-atlas
// (countries-110m), pour colorer le bon pays sur la carte (RegionMap). Intl
// (CLDR) suffit pour la plupart des pays ; quelques-uns portent un nom abrégé
// ou différent dans world-atlas -> table de correspondance. NB : les
// micro-États et petites îles (Monaco, Malte, Maurice, Seychelles, Andorre,
// Saint-Marin, Comores, Cabo Verde, Vatican, São Tomé, Liechtenstein) sont
// ABSENTS du jeu 110m -> non affichés à cette résolution (acceptable).
const ISO_TO_WA: Record<string, string> = {
  CD: 'Dem. Rep. Congo',
  CG: 'Congo',
  CF: 'Central African Rep.',
  GQ: 'Eq. Guinea',
  SZ: 'eSwatini',
  SS: 'S. Sudan',
  BA: 'Bosnia and Herz.',
  MK: 'Macedonia',
  XK: 'Kosovo',
  CI: "Côte d'Ivoire",
};

export function mapNameForIso(iso2: string): string | null {
  const code = iso2.toUpperCase();
  if (ISO_TO_WA[code]) return ISO_TO_WA[code];
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    // world-atlas utilise l'apostrophe droite (Côte d'Ivoire).
    return n ? n.replace(/’/g, "'") : null;
  } catch {
    return null;
  }
}
