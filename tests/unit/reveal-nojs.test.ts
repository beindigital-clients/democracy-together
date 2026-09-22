import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Garde anti-régression : contenu invisible sans JavaScript (audit § 5.6).
//
// framer-motion rend `initial={{ opacity: 0 }}` en style INLINE côté serveur.
// Sans script pour lancer l'animation, le contenu reste invisible — mesuré
// avant correctif : page des mentions légales entièrement blanche, accueil
// réduit à son en-tête. C'est rédhibitoire pour l'objectif « mobile et faible
// débit » (F-05), et invisible en développement, où JavaScript marche toujours.
//
// Le correctif repose sur un contrat en deux parties :
//   1. tout élément animé porte `data-reveal` ;
//   2. le layout sert, sous <noscript>, une règle qui les rend visibles.
// Ce test vérifie les deux. Il échouera le jour où quelqu'un ajoutera un
// `<motion.*>` sans le marqueur — cas que ni le typecheck ni les tests de
// rendu ne rattraperaient.
//
// MISE À JOUR (audit F-05) : le HTML servi ne porte plus `opacity:0` du tout —
// `reveal.tsx` ne pose le voile qu'APRÈS le montage, parce qu'un élément
// invisible n'est pas candidat au LCP et repoussait celui de /fr/barometre à
// 12,8 s en 3G lente. Les deux parties du contrat gardent néanmoins leur
// raison d'être : `data-reveal` reste le marqueur par lequel on retrouve les
// éléments animés, et la règle <noscript> reste le filet si le voile venait à
// repasser côté serveur. Ce test tient donc toujours, en défense de fond.

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
    // Reveal, RevealGroup et RevealItem : trois composants exportés.
    const exported = reveal.match(/export function (Reveal\w*)/g) ?? [];
    expect(exported).toHaveLength(3);
    expect((reveal.match(/data-reveal/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
  });
});
