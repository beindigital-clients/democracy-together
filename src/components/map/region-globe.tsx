'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoContains, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';

import worldTopo from 'world-atlas/countries-110m.json';
import type { RegionMapItem } from './region-map';

/* eslint-disable @typescript-eslint/no-explicit-any */
const LAND: any[] = (
  feature(worldTopo as any, (worldTopo as any).objects.countries) as any
).features;

type Region = 'all' | 'afrique' | 'europe';

function hexA(hex: string, a: number): string {
  const h = hex.trim().replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
function resolveFill(fill: string): string {
  const m = fill.match(/var\((--[\w-]+)\)/);
  if (!m) return fill;
  return cssVar(m[1]) || cssVar(m[1].replace('--color-', '--')) || fill;
}

// Globe 3D interactif (projection orthographique, rendu canvas). Réutilisable
// pour le baromètre (choroplèthe des pays notés) et l'annuaire (membres). Le
// canvas est aria-hidden (enrichissement visuel) — la donnée reste accessible
// dans le tableau/la liste de la page et dans le panneau de détail (aria-live).
export function RegionGlobe({
  items,
  hint,
  ariaLabel,
  chips,
  variant = 'full',
}: {
  items: RegionMapItem[];
  hint: string;
  ariaLabel: string;
  chips?: { all: string; afrique: string; europe: string };
  variant?: 'full' | 'compact';
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [region, setRegion] = useState<Region>('all');
  const [selected, setSelected] = useState<RegionMapItem | null>(null);

  const regionRef = useRef<Region>('all');
  // Écrire un ref PENDANT le rendu casse le rendu concurrent. `regionRef` n'est
  // relu que dans la boucle de dessin du canevas, qui tourne après la
  // validation : le mettre à jour dans un effet est donc équivalent ici.
  useEffect(() => {
    regionRef.current = region;
  }, [region]);
  const byName = useMemo(
    () => new Map(items.map((it) => [it.name, it])),
    [items],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fillCache = new Map<string, string>();
    const fillOf = (it: RegionMapItem) => {
      let c = fillCache.get(it.name);
      if (!c) {
        c = resolveFill(it.fill);
        fillCache.set(it.name, c);
      }
      return c;
    };
    let land = cssVar('--surface-2') || '#e7e3d8';
    let stroke = cssVar('--paper') || '#faf8f3';
    let ink = cssVar('--ink') || '#16191f';

    const rotation: [number, number] = [-12, -16]; // centré Afrique-Europe
    let W = 0,
      H = 0,
      R = 0;
    const projection = geoOrthographic()
      .rotate([rotation[0], rotation[1], 0])
      .clipAngle(90);
    const pathGen = geoPath(projection, ctx);
    const graticule = geoGraticule10();

    let dragging = false;
    let lastX = 0,
      lastY = 0;
    let hoverName: string | null = null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const auto = !reduce;

    function resize() {
      // La taille d'AFFICHAGE est 100 % pilotée par le CSS : `wrap` est
      // `w-full max-w-[…] aspect-square` et le canvas le remplit en absolu
      // (inset-0). On ne fixe JAMAIS de largeur en pixels sur le canvas -> il
      // ne peut pas déborder son conteneur ni la page, quelle que soit la
      // mesure (plus de course à l'hydratation). Ici on ne règle que la
      // résolution du tampon de rendu.
      const rect = wrap!.getBoundingClientRect();
      const size = rect.width;
      if (size < 40) return; // pas encore mis en page (mesure à 0)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = size;
      H = size; // wrap carré (aspect-square)
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Marge pour que le halo atmosphérique tienne entièrement dans le canvas
      // carré (sinon le cercle de halo est rogné par les bords -> forme coupée).
      const pad = Math.max(12, Math.round(size * 0.06));
      R = size / 2 - pad;
      projection.scale(R).translate([W / 2, H / 2]);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let raf = 0;
    function draw() {
      projection.rotate([rotation[0], rotation[1], 0]);
      ctx!.clearRect(0, 0, W, H);
      const cx = W / 2,
        cy = H / 2;

      // atmosphère : halo circulaire doux, entièrement contenu dans le canvas
      // (rayon = plus grand cercle inscrit dans le carré). Lumière de limbe la
      // plus vive au ras de la sphère, fondu jusqu'à transparent avant le bord
      // -> cercle net, jamais rogné par les côtés.
      const haloR = Math.min(cx, cy) - 1;
      const glow = ctx!.createRadialGradient(cx, cy, R, cx, cy, haloR);
      glow.addColorStop(0, hexA('#5b8fd6', 0.32));
      glow.addColorStop(0.4, hexA('#33619c', 0.12));
      glow.addColorStop(1, hexA('#33619c', 0));
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx!.fill();

      // sphère (océan marine, dégradé radial -> effet 3D)
      const sea = ctx!.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.4,
        R * 0.15,
        cx,
        cy,
        R,
      );
      sea.addColorStop(0, '#244a82');
      sea.addColorStop(1, '#0c1d3a');
      ctx!.beginPath();
      pathGen({ type: 'Sphere' } as any);
      ctx!.fillStyle = sea;
      ctx!.fill();

      // graticule discret
      ctx!.beginPath();
      pathGen(graticule);
      ctx!.strokeStyle = hexA('#ffffff', 0.06);
      ctx!.lineWidth = 0.5;
      ctx!.stroke();

      // pays
      for (const f of LAND) {
        const it = byName.get(f.properties?.name);
        ctx!.beginPath();
        pathGen(f);
        if (it) {
          const dim =
            regionRef.current !== 'all' && it.region !== regionRef.current;
          ctx!.fillStyle = dim ? hexA(fillOf(it), 0.28) : fillOf(it);
        } else {
          ctx!.fillStyle = hexA(land, 0.82);
        }
        ctx!.fill();
        ctx!.strokeStyle = hexA(stroke, 0.45);
        ctx!.lineWidth = 0.4;
        ctx!.stroke();
      }

      // pays survolé
      if (hoverName) {
        const f = LAND.find((g) => g.properties?.name === hoverName);
        if (f) {
          ctx!.beginPath();
          pathGen(f);
          ctx!.strokeStyle = ink;
          ctx!.lineWidth = 1.4;
          ctx!.stroke();
        }
      }

      if (auto && !dragging && !hoverName) rotation[0] += 0.16;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    function pointFromEvent(e: PointerEvent): [number, number] {
      const rect = canvas!.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }
    // Pays *avec donnée* sous un point (coords canvas), ou null (océan / pays
    // non noté / hors sphère).
    function hitTest(p: [number, number]) {
      const none = {
        name: null as string | null,
        it: null as RegionMapItem | null,
      };
      if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) return none;
      const inv = projection.invert?.(p);
      if (!inv) return none;
      for (const f of LAND) {
        const cand = byName.get(f.properties?.name);
        if (cand && geoContains(f, inv)) {
          return { name: f.properties.name as string, it: cand };
        }
      }
      return none;
    }
    function applySelection(name: string | null, it: RegionMapItem | null) {
      if (name !== hoverName) {
        hoverName = name;
        setSelected(it);
      }
    }

    // Seuil (px) sous lequel un geste est un *appui* (sélection) plutôt qu'un
    // *glissé* (rotation). Indispensable au tactile, qui n'a pas de survol :
    // sans ça, un tap ouvre puis ferme le drag et ne sélectionne jamais rien.
    const TAP_SLOP = 10;
    let moved = 0;
    function onDown(e: PointerEvent) {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    function onMove(e: PointerEvent) {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        rotation[0] += dx * 0.32;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1] - dy * 0.32));
        lastX = e.clientX;
        lastY = e.clientY;
        // au-delà du seuil c'est un vrai glissé : on lève la sélection
        if (moved > TAP_SLOP && hoverName) applySelection(null, null);
        return;
      }
      // souris : survol en direct
      const { name, it } = hitTest(pointFromEvent(e));
      applySelection(name, it);
    }
    function onUp(e: PointerEvent) {
      // appui sans (quasi) déplacement -> sélection au point touché. C'est ce
      // qui rend la carte interactive au tactile : un tap affiche le score.
      if (dragging && moved <= TAP_SLOP) {
        const { name, it } = hitTest(pointFromEvent(e));
        applySelection(name, it);
      }
      dragging = false;
    }
    function onCancel() {
      // le navigateur a repris le geste (défilement vertical de la page) :
      // on annule le glissé sans rien sélectionner.
      dragging = false;
    }
    function onLeave(e: PointerEvent) {
      dragging = false;
      // souris : quitter le canvas efface le survol. Au tactile, la sélection
      // issue d'un appui doit persister (rien à « dé-survoler »).
      if (e.pointerType === 'mouse') applySelection(null, null);
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);

    const mo = new MutationObserver(() => {
      fillCache.clear();
      land = cssVar('--surface-2') || land;
      stroke = cssVar('--paper') || stroke;
      ink = cssVar('--ink') || ink;
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-universe'],
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [byName, variant]);

  const canvasEl = (
    <div
      ref={wrapRef}
      className={`relative mx-auto aspect-square w-full ${
        variant === 'compact' ? 'max-w-[360px]' : 'max-w-[520px]'
      }`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
      />
    </div>
  );

  if (variant === 'compact') {
    return (
      <div>
        {canvasEl}
        <p
          aria-live="polite"
          className="mt-3 text-center text-sm text-ink-soft"
        >
          {selected
            ? `${selected.title}${selected.rows[0] ? ` · ${selected.rows[0].value}` : ''}`
            : hint}
        </p>
      </div>
    );
  }

  const regions: Region[] = ['all', 'afrique', 'europe'];
  return (
    <div
      className={`grid gap-5 ${chips ? 'lg:grid-cols-[1.5fr_0.5fr]' : 'lg:grid-cols-[1.6fr_0.4fr]'}`}
    >
      <div className="min-w-0 rounded-sm border border-line bg-surface p-3">
        {canvasEl}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {chips ? (
          <div
            role="group"
            aria-label={ariaLabel}
            className="flex flex-wrap gap-2"
          >
            {regions.map((r) => {
              const active = region === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRegion(r)}
                  className={`rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-line-strong bg-surface text-ink-soft hover:text-ink'
                  }`}
                >
                  {chips[r]}
                </button>
              );
            })}
          </div>
        ) : null}
        <div
          aria-live="polite"
          className="min-h-[132px] rounded-sm border border-line bg-surface p-4"
        >
          {selected ? (
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: selected.fill }}
                  aria-hidden="true"
                />
                <h3 className="font-display text-lg leading-tight">
                  {selected.title}
                </h3>
              </div>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                {selected.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-muted">{row.label}</dt>
                    <dd
                      className={
                        row.valueClassName ??
                        'font-mono text-base font-semibold text-ink'
                      }
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">{hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
