/* eslint-disable @typescript-eslint/no-explicit-any */
import { geoMercator, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';

// Geometry of the regional map (Africa-Europe) shared by the Barometer and the
// directory. Computed SERVER-SIDE only: neither d3-geo nor the world TopoJSON
// (~107 KB) ends up in the client bundle — only the SVG `d` strings of the
// kept countries are passed as props. We keep the countries whose CENTROID
// falls within the Africa+Europe zone (excludes the Americas, Greenland,
// Asia, Antarctica), then fit the Mercator projection exactly to those
// countries (auto framing).

export const MAP_W = 680;
export const MAP_H = 760;

export type MapShape = { name: string; d: string };

// Africa + Europe zone by centroid: lon -26..52, lat -37..73.
function inRegion(f: any): boolean {
  const [lon, lat] = geoCentroid(f);
  return lon >= -26 && lon <= 52 && lat >= -37 && lat <= 73;
}

export function buildRegionShapes(): MapShape[] {
  const topo = worldTopo as any;
  const fc = feature(topo, topo.objects.countries) as any;
  const kept = fc.features.filter(inRegion);

  const projection = geoMercator().fitExtent(
    [
      [10, 10],
      [MAP_W - 10, MAP_H - 10],
    ],
    { type: 'FeatureCollection', features: kept } as any,
  );
  const pathGen = geoPath(projection);

  const out: MapShape[] = [];
  for (const f of kept) {
    const d = pathGen(f);
    if (d) out.push({ name: String(f.properties?.name ?? ''), d });
  }
  return out;
}
