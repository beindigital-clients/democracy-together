/* eslint-disable @typescript-eslint/no-explicit-any */
import { geoMercator, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';

// Géométrie de la carte régionale (Afrique-Europe) partagée par le Baromètre et
// l'annuaire. Calculé CÔTÉ SERVEUR uniquement : ni d3-geo ni le TopoJSON monde
// (~107 Ko) ne partent dans le bundle client — seules les chaînes `d` SVG des
// pays gardés sont passées en props. On garde les pays dont le CENTROÏDE tombe
// dans la zone Afrique+Europe (exclut Amériques, Groenland, Asie, Antarctique),
// puis on ajuste la projection Mercator exactement à ces pays (cadrage auto).

export const MAP_W = 680;
export const MAP_H = 760;

export type MapShape = { name: string; d: string };

// Zone Afrique + Europe par centroïde : lon -26..52, lat -37..73.
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
