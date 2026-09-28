// Converts an ISO 3166-1 alpha-2 country code to a world-atlas label
// (countries-110m), to colour the right country on the map (RegionMap). Intl
// (CLDR) is enough for most countries; a few carry an abbreviated or
// different name in world-atlas -> lookup table. NB: the
// micro-states and small islands (Monaco, Malta, Mauritius, Seychelles, Andorra,
// San Marino, Comoros, Cabo Verde, Vatican, São Tomé, Liechtenstein) are
// ABSENT from the 110m dataset -> not displayed at this resolution (acceptable).
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
    // world-atlas uses the straight apostrophe (Côte d'Ivoire).
    return n ? n.replace(/’/g, "'") : null;
  } catch {
    return null;
  }
}
