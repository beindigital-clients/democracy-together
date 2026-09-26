import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';
import { SITE_LOCALES, locale } from '@convex/lib/locales';
import { PUB_LANGS } from '@convex/lib/publications';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';

// LA LISTE DES LANGUES EST ÉCRITE À TROIS ENDROITS, et elle ne peut pas l'être
// ailleurs :
//
//   src/i18n/routing.ts        `routing.locales`  — la seule qui fasse autorité
//   convex/lib/locales.ts      `SITE_LOCALES`, et le validateur `locale`
//   convex/lib/publications.ts `PUB_LANGS`        — la facette bibliothèque
//
// Convex ne peut PAS importer un module de `src/` : son bundle est déployé
// séparément et n'a pas l'alias `@/`. La recopie est donc imposée par
// l'architecture, pas choisie. Ce que ce test empêche, c'est qu'elle DÉRIVE —
// le mode d'échec réel étant silencieux : une sixième langue ajoutée au routage
// sans l'être au validateur ferait passer tout le site, jusqu'à ce qu'un membre
// tente de déposer une publication dans cette langue et reçoive une erreur de
// validation à l'écriture.
//
// `convex/lib/locales.ts` est IMPORTÉ, pas lu comme du texte : il ne tire que
// `convex/values`, donc il n'y a rien à monter. C'est précisément pour cela
// qu'il a été extrait de `convex/schema.ts`, lequel tire `authTables`.
//
// LA TROISIÈME COMPARAISON EST LA MOINS ÉVIDENTE ET LA PLUS UTILE : à
// l'intérieur même de ce module, la LISTE (`SITE_LOCALES`) et le VALIDATEUR
// (`v.union(v.literal(…))`) sont deux écritures séparées de la même vérité.
// Rien dans TypeScript n'oblige la seconde à suivre la première.

/** Les littéraux effectivement admis par le validateur Convex. */
function validatorLiterals(): string[] {
  // `v.union(...)` expose ses branches : on interroge le validateur lui-même
  // plutôt que le texte qui le déclare.
  return (locale.members as readonly { value: string }[]).map((m) => m.value);
}

describe('Langues du site — les déclarations disent la même chose', () => {
  it('la garde interroge vraiment le validateur', () => {
    // Sans cette vérification, une API Convex qui cesserait d'exposer `members`
    // rendrait une liste vide, et le test passerait au vert en comparant deux
    // fois rien.
    expect(validatorLiterals().length).toBeGreaterThan(1);
  });

  it('le validateur Convex admet exactement les locales routées', () => {
    expect(validatorLiterals()).toEqual([...routing.locales]);
  });

  it('la liste et le validateur du même module concordent', () => {
    expect([...SITE_LOCALES]).toEqual(validatorLiterals());
  });

  it('la facette de langue de la bibliothèque couvre les mêmes', () => {
    expect([...PUB_LANGS]).toEqual([...routing.locales]);
  });
});

describe('Langues du site — chacune est complètement décrite', () => {
  it('porte un endonyme non vide', () => {
    // Le sélecteur affiche ces libellés et eux seuls : une locale sans endonyme
    // y apparaîtrait comme une ligne vide, cliquable.
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
