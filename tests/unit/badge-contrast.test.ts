import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { badgeVariants } from '@/components/ui/badge';

// STATUS BADGES HOLD 4.5:1 (RGAA 3.2, small text) on every surface they sit
// on, in both themes. Their text and tint are `color-mix()` of the theme's
// tokens: computed here from `globals.css` and from the variants' OWN
// classes, so a change to either is measured. Measured on 01/10: the plain
// bar colours on their 9-10 % tint fell to 3.9:1 (pending) and 4.47:1 (good,
// an axe failure on a library record).

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

type Tokens = Record<string, string>;

function block(selector: string): Tokens {
  const start = css.indexOf(`\n${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const tokens: Tokens = {};
  for (const m of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm))
    tokens[m[1]] = m[2].trim();
  return tokens;
}

const LIGHT = block(':root');
const THEMES: Record<string, Tokens> = {
  light: LIGHT,
  dark: { ...LIGHT, ...block("[data-theme='dark']") },
};

type Rgb = [number, number, number];

// `--color-x` (the Tailwind name) is `--x`; `var(--y)` is followed.
function color(theme: Tokens, name: string): Rgb {
  const value = theme[name.replace(/^color-/, '')];
  const ref = /^var\(--([\w-]+)\)$/.exec(value ?? '');
  if (ref) return color(theme, ref[1]);
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '');
  if (!hex) throw new Error(`token --${name}: ${value}`);
  const n = parseInt(hex[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// `color-mix(in srgb, a p%, b)`: per channel, in gamma-encoded sRGB.
const mix = (a: Rgb, b: Rgb, p: number): Rgb =>
  a.map((c, i) => c * p + b[i] * (1 - p)) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Badge — les tons de statut restent lisibles (RGAA 3.2)', () => {
  for (const variant of ['good', 'pending', 'bad'] as const) {
    const classes = badgeVariants({ variant });
    const text =
      /text-\[color-mix\(in_srgb,var\(--([\w-]+)\)_(\d+)%,var\(--([\w-]+)\)\)\]/.exec(
        classes,
      );
    const tint =
      /bg-\[color-mix\(in_srgb,var\(--([\w-]+)\)_(\d+)%,transparent\)\]/.exec(
        classes,
      );

    for (const [mode, theme] of Object.entries(THEMES)) {
      it(`${variant}, thème ${mode} : au moins 4,5:1 sur paper, surface et surface-2`, () => {
        expect(text, classes).not.toBeNull();
        expect(tint, classes).not.toBeNull();
        const ink = mix(
          color(theme, text![1]),
          color(theme, text![3]),
          Number(text![2]) / 100,
        );
        for (const surface of ['paper', 'surface', 'surface-2']) {
          // The tint is translucent: it lies over the surface.
          const bg = mix(
            color(theme, tint![1]),
            color(theme, surface),
            Number(tint![2]) / 100,
          );
          expect(contrast(ink, bg), `${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});
