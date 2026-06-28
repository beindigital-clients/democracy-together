'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  geoOrthographic,
  geoPath,
  geoContains,
  geoGraticule10,
} from 'd3-geo';
import { feature } from 'topojson-client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  regionRef.current = region;
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
    const projection = geoOrthographic().rotate([rotation[0], rotation[1], 0]).clipAngle(90);
    const pathGen = geoPath(projection, ctx);
    const graticule = geoGraticule10();

    let dragging = false;
    let lastX = 0,
      lastY = 0;
    let hoverName: string | null = null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let auto = !reduce;

    function resize() {
      const rect = wrap!.getBoundingClientRect();
      const size = Math.max(
        220,
        Math.min(rect.width, variant === 'compact' ? 340 : 520),
      );
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = size;
      H = size;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = size / 2 - 8;
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

      // atmosphère
      const glow = ctx!.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.16);
      glow.addColorStop(0, hexA('#2f5fa8', 0.0));
      glow.addColorStop(0.55, hexA('#2f5fa8', 0.14));
      glow.addColorStop(1, hexA('#2f5fa8', 0));
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
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
      pathGen(graticule as any);
      ctx!.strokeStyle = hexA('#ffffff', 0.06);
      ctx!.lineWidth = 0.5;
      ctx!.stroke();

      // pays
      for (const f of LAND) {
        const it = byName.get(f.properties?.name);
        ctx!.beginPath();
        pathGen(f);
        if (it) {
          const dim = regionRef.current !== 'all' && it.region !== regionRef.current;
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

    function pointFromEvent(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
    }
    function onDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas!.setPointerCapture?.(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (dragging) {
        rotation[0] += (e.clientX - lastX) * 0.32;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1] - (e.clientY - lastY) * 0.32));
        lastX = e.clientX;
        lastY = e.clientY;
        if (hoverName) {
          hoverName = null;
          setSelected(null);
        }
        return;
      }
      const p = pointFromEvent(e);
      if (p[0] < 0 || p[1] < 0 || p[0] > W || p[1] > H) return;
      const inv = projection.invert?.(p);
      let name: string | null = null;
      let it: RegionMapItem | null = null;
      if (inv) {
        for (const f of LAND) {
          const cand = byName.get(f.properties?.name);
          if (cand && geoContains(f as any, inv)) {
            name = f.properties.name;
            it = cand;
            break;
          }
        }
      }
      if (name !== hoverName) {
        hoverName = name;
        setSelected(it);
      }
    }
    function onUp() {
      dragging = false;
    }
    function onLeave() {
      dragging = false;
      hoverName = null;
      setSelected(null);
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [byName, variant]);

  const canvasEl = (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-[540px]">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="mx-auto block cursor-grab touch-none select-none active:cursor-grabbing"
      />
    </div>
  );

  if (variant === 'compact') {
    return (
      <div>
        {canvasEl}
        <p aria-live="polite" className="mt-3 text-center text-sm text-ink-soft">
          {selected
            ? `${selected.title}${selected.rows[0] ? ` · ${selected.rows[0].value}` : ''}`
            : hint}
        </p>
      </div>
    );
  }

  const regions: Region[] = ['all', 'afrique', 'europe'];
  return (
    <div className={`grid gap-5 ${chips ? 'lg:grid-cols-[1.5fr_0.5fr]' : 'lg:grid-cols-[1.6fr_0.4fr]'}`}>
      <div className="rounded-sm border border-line bg-surface p-3">{canvasEl}</div>
      <div className="flex flex-col gap-4">
        {chips ? (
          <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
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
        <div aria-live="polite" className="min-h-[132px] rounded-sm border border-line bg-surface p-4">
          {selected ? (
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: selected.fill }}
                  aria-hidden="true"
                />
                <h3 className="font-display text-lg leading-tight">{selected.title}</h3>
              </div>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                {selected.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className={row.valueClassName ?? 'font-mono text-base font-semibold text-ink'}>
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
