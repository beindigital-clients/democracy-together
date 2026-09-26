import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';
import { PUB_LANGS } from '@convex/lib/publications';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';

// LA LISTE DES LANGUES EST ÉCRITE À TROIS ENDROITS, et elle ne peut pas l'être
// ailleurs :
//
//   src/i18n/routing.ts        `routing.locales`  — la seule qui fasse autorité
//   convex/schema.ts           `locale`           — un validateur Convex
//   convex/lib/publications.ts `PUB_LANGS`        — la facette bibliothèque
//
// Convex ne peut PAS importer un module de `src/` : son bundle est déployé
// séparément et n'a pas l'alias `@/`. La recopie est donc imposée par
// l'architecture, pas choisie. Ce que ce test empêche, c'est qu'elle DÉRIVE —
// le mode d'échec réel étant silencieux : une sixième langue ajoutée au
// routage sans l'être au validateur ferait passer tout le site, jusqu'à ce
// qu'un membre tente de déposer une publication dans cette langue et reçoive
// une erreur de validation à l'écriture.
//
// Le validateur est lu dans le SOURCE plutôt qu'importé : `convex/schema.ts`
// tire `authTables` de `@convex-dev/auth`, que ce test n'a aucune raison de
// monter. Même compromis que `tests/unit/seo-coherence.test.ts`, et donc même
// garde contre une expression régulière qui cesserait de correspondre.

function localeValidatorLiterals(): string[] {
  const src = readFileSync(join(process.cwd(), 'convex', 'schema.ts'), 'utf8');
  const m = /export const locale = v\.union\(([\s\S]*?)\);/.exec(src);
  if (!m)
    throw new Error('validateur `locale` introuvable dans convex/schema.ts');
  return [...m[1].matchAll(/v\.literal\('([^']+)'\)/g)].map((x) => x[1]);
}

describe('Langues du site — les trois déclarations disent la même chose', () => {
  it('la garde lit vraiment le validateur Convex', () => {
    // Sans cette vérification, une régression de lecture rendrait la liste
    // vide et le test passerait au vert en comparant deux fois rien.
    expect(localeValidatorLiterals().length).toBeGreaterThan(1);
  });

  it('le validateur Convex couvre exactement les locales routées', () => {
    expect(localeValidatorLiterals()).toEqual([...routing.locales]);
  });

  it('la facette de langue de la bibliothèque couvre les mêmes', () => {
    expect([...PUB_LANGS]).toEqual([...routing.locales]);
  });
});

describe('Langues du site — chacune est complètement décrite', () => {
  it('porte un endonyme non vide', () => {
    // Le sélecteur affiche ces libellés et eux seuls : une locale sans
    // endonyme y apparaîtrait comme une ligne vide, cliquable.
    for (const l of routing.locales) {
      expect(
        LOCALE_ENDONYMS[l],
        `endonyme manquant pour « ${l} »`,
      ).toBeTruthy();
    }
  });

  it('porte un sens d’écriture admis', () => {
    for (const l of routing.locales) {
      expect(['ltr', 'rtl']).toContain(direction(l));
    }
  });

  it('possède son catalogue de messages', () => {
    for (const l of routing.locales) {
      const path = join(process.cwd(), 'src', 'messages', `${l}.json`);
      expect(
        () => readFileSync(path, 'utf8'),
        `catalogue absent : src/messages/${l}.json`,
      ).not.toThrow();
    }
  });
});
