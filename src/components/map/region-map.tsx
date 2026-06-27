'use client';

import { useMemo, useState } from 'react';
import type { MapShape } from '@/lib/region-geo';

export type RegionMapItem = {
  name: string; // libellé world-atlas (clé de correspondance)
  region?: 'afrique' | 'europe'; // pour le filtre par chips (optionnel)
  fill: string; // couleur de remplissage du pays
  title: string; // titre du panneau de détail (localisé)
  rows: { label: string; value: string; valueClassName?: string }[];
};

type Region = 'all' | 'afrique' | 'europe';

// Carte choroplèthe Afrique-Europe réutilisable (F-19 annuaire, F-30 baromètre).
// Rendue en SSR (tracés calculés côté serveur). La carte est un ENRICHISSEMENT
// VISUEL (aria-hidden) — la donnée reste accessible ailleurs sur la page (table
// /liste), et les pays ne sont pas des pièges au clavier. Interactions :
// survol/tap d'un pays mis en avant -> panneau de détail ; chips de filtre par
// région (optionnelles, vrais boutons accessibles au clavier).
export function RegionMap({
  shapes,
  width,
  height,
  items,
  hint,
  ariaLabel,
  chips,
  variant = 'full',
}: {
  shapes: MapShape[];
  width: number;
  height: number;
  items: RegionMapItem[];
  hint: string;
  ariaLabel: string;
  chips?: { all: string; afrique: string; europe: string };
  // 'full' : carte + panneau de détail (+ chips). 'compact' : carte + légende
  // de survol en une ligne (teaser, ex. accueil) — sans panneau ni chips.
  variant?: 'full' | 'compact';
}) {
  const [region, setRegion] = useState<Region>('all');
  const [hovered, setHovered] = useState<string | null>(null);
  const byName = useMemo(
    () => new Map(items.map((it) => [it.name, it])),
    [items],
  );
  const selected = hovered ? (byName.get(hovered) ?? null) : null;
  const regions: Region[] = ['all', 'afrique', 'europe'];

  const svg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={`mx-auto block h-auto w-full ${variant === 'compact' ? 'max-w-[330px]' : 'max-w-[540px]'}`}
    >
      {shapes.map((s) => {
        const it = byName.get(s.name);
        if (!it) {
          return (
            <path
              key={s.name}
              d={s.d}
              fill="var(--color-surface-2)"
              stroke="var(--color-paper)"
              strokeWidth={0.4}
            />
          );
        }
        const dim = region !== 'all' && it.region !== region;
        const isHover = hovered === s.name;
        return (
          <path
            key={s.name}
            d={s.d}
            fill={it.fill}
            fillOpacity={dim ? 0.25 : 1}
            stroke={isHover ? 'var(--color-ink)' : 'var(--color-paper)'}
            strokeWidth={isHover ? 1.3 : 0.5}
            className="cursor-pointer [transition:fill-opacity_.2s,stroke-width_.15s]"
            onMouseEnter={() => setHovered(s.name)}
            onMouseLeave={() => setHovered((h) => (h === s.name ? null : h))}
            onClick={() => setHovered(s.name)}
          />
        );
      })}
    </svg>
  );

  if (variant === 'compact') {
    return (
      <div>
        {svg}
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

  return (
    <div
      className={`grid gap-5 ${chips ? 'lg:grid-cols-[1.5fr_0.5fr]' : 'lg:grid-cols-[1.6fr_0.4fr]'}`}
    >
      <div className="rounded-sm border border-line bg-surface p-3">{svg}</div>

      <div className="flex flex-col gap-4">
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
