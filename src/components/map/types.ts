// Data contract for the regional visualizations (SVG map and globe).
//
// The type lived in `region-map.tsx`, whose component is mounted
// nowhere — audit § 5.9 concluded the file was dead, whereas the
// TYPE is very much alive: it is produced by the pages (home,
// barometer, directory) and consumed by `region-globe.tsx`. Moving it out of here
// decouples this contract from the fate of the `RegionMap` component, decided with #13
// (issue #40).
//
// This module must keep NO runtime dependency: it is imported by
// client components, whereas the geometry (`@/lib/region-geo`) bundles
// d3-geo and the world topology and stays computed server-side.

export type RegionMapItem = {
  name: string; // world-atlas label (matching key)
  region?: 'afrique' | 'europe'; // for the chip filter (optional)
  fill: string; // country fill colour
  title: string; // detail panel title (localized)
  rows: { label: string; value: string; valueClassName?: string }[];
};
