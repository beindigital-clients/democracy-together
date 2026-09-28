'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoContains, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';

import worldTopo from 'world-atlas/countries-110m.json';
import type { RegionMapItem } from './types';

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

// Interactive 3D globe (orthographic projection, canvas rendering). Reusable
// for the barometer (choropleth of rated countries) and the directory (members). The
// canvas is aria-hidden (visual enhancement) — the data stays accessible
// in the page's table/list and in the detail panel (aria-live).
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

  // AUTO-ROTATION. The globe spins on its own until the user interacts with
  // it: hovering a country or dragging stops it. There is deliberately no
  // pause button (client decision, 28/09): it weighed on the visual. The
  // system `prefers-reduced-motion` preference keeps it still from the start.
  // Trade-off accepted knowingly: RGAA 13.8 / WCAG 2.2.2 ask for a control
  // that stops continuous motion, usable with the keyboard; without the
  // button, the criterion is non-compliant again (see the accessibility
  // statement and docs/rgaa/audit-2026-09.md).
  const rotatingRef = useRef(false);
  useEffect(() => {
    rotatingRef.current = !matchMedia('(prefers-reduced-motion: reduce)')
      .matches;
  }, []);

  const regionRef = useRef<Region>('all');
  // Writing a ref DURING render breaks concurrent rendering. `regionRef` is only
  // read back in the canvas drawing loop, which runs after
  // commit: updating it in an effect is therefore equivalent here.
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

    const rotation: [number, number] = [-12, -16]; // centred on Africa-Europe
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

    function resize() {
      // The DISPLAY size is 100% driven by CSS: `wrap` is
      // `w-full max-w-[…] aspect-square` and the canvas fills it absolutely
      // (inset-0). We NEVER set a pixel width on the canvas -> it
      // cannot overflow its container or the page, whatever the
      // measurement (no more hydration race). Here we only set the
      // render buffer's resolution.
      const rect = wrap!.getBoundingClientRect();
      const size = rect.width;
      if (size < 40) return; // not laid out yet (measured at 0)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = size;
      H = size; // square wrap (aspect-square)
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Margin so the atmospheric halo fits entirely within the square
      // canvas (otherwise the halo circle is clipped by the edges -> cut-off shape).
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

      // atmosphere: soft circular halo, entirely contained in the canvas
      // (radius = largest circle inscribed in the square). Limb light
      // brightest right at the sphere, fading to transparent before the edge
      // -> clean circle, never clipped by the sides.
      const haloR = Math.min(cx, cy) - 1;
      const glow = ctx!.createRadialGradient(cx, cy, R, cx, cy, haloR);
      glow.addColorStop(0, hexA('#5b8fd6', 0.32));
      glow.addColorStop(0.4, hexA('#33619c', 0.12));
      glow.addColorStop(1, hexA('#33619c', 0));
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx!.fill();

      // sphere (navy ocean, radial gradient -> 3D effect)
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

      // hovered country
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

      if (rotatingRef.current && !dragging && !hoverName) rotation[0] += 0.16;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    function pointFromEvent(e: PointerEvent): [number, number] {
      const rect = canvas!.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }
    // Country *with data* under a point (canvas coords), or null (ocean / unrated
    // country / outside the sphere).
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

    // Threshold (px) below which a gesture is a *press* (selection) rather than a
    // *drag* (rotation). Essential for touch, which has no hover:
    // without it, a tap opens then closes the drag and never selects anything.
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
        // beyond the threshold it's a real drag: clear the selection
        if (moved > TAP_SLOP && hoverName) applySelection(null, null);
        return;
      }
      // mouse: live hover
      const { name, it } = hitTest(pointFromEvent(e));
      applySelection(name, it);
    }
    function onUp(e: PointerEvent) {
      // press with (almost) no movement -> select at the touched point. This is what
      // makes the map interactive on touch: a tap shows the score.
      if (dragging && moved <= TAP_SLOP) {
        const { name, it } = hitTest(pointFromEvent(e));
        applySelection(name, it);
      }
      dragging = false;
    }
    function onCancel() {
      // the browser took over the gesture (vertical page scroll):
      // cancel the drag without selecting anything.
      dragging = false;
    }
    function onLeave(e: PointerEvent) {
      dragging = false;
      // mouse: leaving the canvas clears the hover. On touch, the selection
      // from a press must persist (nothing to "un-hover").
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
