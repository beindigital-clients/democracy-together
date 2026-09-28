'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps, ReactNode } from 'react';
import type { RegionGlobe as RegionGlobeType } from './region-globe';

// Deferred loading of the globe (audit § 5.6).
//
// `region-globe` bundles d3-geo, topojson-client and the world-atlas world
// topology — a 136 KB chunk on its own. Imported statically, it sat
// on the critical path of THREE pages (/, /barometre, /le-reseau) and
// delayed hydration of everything else, whereas the comment in
// `region-geo.ts` promised the opposite.
//
// `ssr: false` is deliberate and lossless: the globe is drawn in a
// <canvas> from DOM measurements, so it produces NO content at
// server render. The information stays accessible elsewhere on each page
// (directory as a list, barometer tables) — the globe is a visual
// enhancement, not the only path to the data.
//
// This file is a CLIENT component: `ssr: false` is not allowed from
// a server component in the App Router, hence this thin wrapper.

const Globe = dynamic(
  () => import('./region-globe').then((m) => m.RegionGlobe),
  {
    ssr: false,
    // Reserves the globe's exact space: without it, its arrival would shift the
    // layout (CLS) once the chunk has loaded.
    loading: () => (
      <div
        aria-hidden="true"
        className="aspect-square w-full rounded-full bg-surface-2"
      />
    ),
  },
);

// `fallback`: caption shown WITHOUT JavaScript, on top of the placeholder
// disc. Measured on 27/09 (cross-cutting C-3): /barometre and /le-reseau
// showed a large bare grey disc, without a word. The `<noscript>` only exists
// in the HTML served to a browser without script; with script, the globe
// takes its place and nothing overlaps.
export function RegionGlobeLazy({
  fallback,
  ...props
}: ComponentProps<typeof RegionGlobeType> & { fallback?: ReactNode }) {
  return (
    <div className="relative">
      <Globe {...props} />
      {fallback ? (
        <noscript>
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <p className="max-w-[32ch] text-sm leading-relaxed text-ink-soft">
              {fallback}
            </p>
          </div>
        </noscript>
      ) : null}
    </div>
  );
}
