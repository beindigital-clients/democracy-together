import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Anti-regression guard: content invisible without JavaScript (audit § 5.6).
//
// framer-motion renders `initial={{ opacity: 0 }}` as an INLINE style on the server.
// Without a script to start the animation, the content stays invisible — measured
// before the fix: the legal notice page entirely blank, the home page
// reduced to its header. That is a deal-breaker for the "mobile and low
// bandwidth" goal (F-05), and invisible in development, where JavaScript always works.
//
// The fix rests on a two-part contract:
//   1. every animated element carries `data-reveal`;
//   2. the layout serves, under <noscript>, a rule that makes them visible.
// This test checks both. It will fail the day someone adds a
// `<motion.*>` without the marker — a case that neither the typecheck nor the render
// tests would catch.
//
// UPDATE (audit F-05): the served HTML no longer carries `opacity:0` at all —
// `reveal.tsx` only applies the veil AFTER mount, because an invisible
// element is not an LCP candidate and was pushing /fr/barometre's LCP to
// 12.8 s on slow 3G. Both parts of the contract nevertheless keep their
// purpose: `data-reveal` remains the marker by which the animated elements
// are found, and the <noscript> rule remains the safety net should the veil ever
// move back to the server side. This test therefore still holds, as defense in depth.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SRC = join(process.cwd(), 'src');

describe('Rendu sans JavaScript — contrat des éléments animés', () => {
  it('chaque <motion.*> porte data-reveal', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<motion\.(\w+)((?:.|\n){0,120})/g)) {
        if (!m[2].includes('data-reveal')) {
          offenders.push(`${file.replace(SRC, 'src')} -> <motion.${m[1]}>`);
        }
      }
    }
    expect(
      offenders,
      `Ces éléments animés seraient invisibles sans JavaScript :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('le layout sert bien la règle de repli sous <noscript>', () => {
    const layout = readFileSync(
      join(SRC, 'app', '[locale]', 'layout.tsx'),
      'utf8',
    );
    expect(layout).toContain('<noscript>');
    expect(layout).toContain('[data-reveal]');
    expect(layout).toMatch(/opacity:\s*1\s*!important/);
    expect(layout).toMatch(/transform:\s*none\s*!important/);
  });

  it('les primitives Reveal posent toutes le marqueur', () => {
    const reveal = readFileSync(
      join(SRC, 'components', 'motion', 'reveal.tsx'),
      'utf8',
    );
    // Reveal, RevealGroup and RevealItem: three exported components.
    const exported = reveal.match(/export function (Reveal\w*)/g) ?? [];
    expect(exported).toHaveLength(3);
    expect((reveal.match(/data-reveal/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
  });
});
