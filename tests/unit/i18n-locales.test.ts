import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';
import { SITE_LOCALES, locale, intlTag } from '@convex/lib/locales';
import { PUB_LANGS } from '@convex/lib/publications';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';
import { intlLocale } from '@/i18n/locale';

// THE LIST OF LANGUAGES IS WRITTEN IN THREE PLACES, and it cannot be
// anywhere else:
//
//   src/i18n/routing.ts        `routing.locales`  — the only authoritative one
//   convex/lib/locales.ts      `SITE_LOCALES`, and the `locale` validator
//   convex/lib/publications.ts `PUB_LANGS`        — the library facet
//
// Convex can NOT import a module from `src/`: its bundle is deployed
// separately and does not have the `@/` alias. The copy is therefore imposed by
// the architecture, not chosen. What this test prevents is it DRIFTING —
// the real failure mode being silent: a sixth language added to routing
// without being added to the validator would let the whole site pass, until a member
// tried to submit a publication in that language and got a validation
// error on write.
//
// `convex/lib/locales.ts` is IMPORTED, not read as text: it only pulls in
// `convex/values`, so there is nothing to mount. That is precisely why
// it was extracted from `convex/schema.ts`, which pulls in `authTables`.
//
// THE THIRD COMPARISON IS THE LEAST OBVIOUS AND THE MOST USEFUL: within
// this very module, the LIST (`SITE_LOCALES`) and the VALIDATOR
// (`v.union(v.literal(…))`) are two separate writings of the same truth.
// Nothing in TypeScript forces the second to follow the first.

/** The literals actually accepted by the Convex validator. */
function validatorLiterals(): string[] {
  // `v.union(...)` exposes its branches: we query the validator itself
  // rather than the text declaring it.
  return (locale.members as readonly { value: string }[]).map((m) => m.value);
}

describe('Langues du site — les déclarations disent la même chose', () => {
  it('la garde interroge vraiment le validateur', () => {
    // Without this check, a Convex API that stopped exposing `members`
    // would return an empty list, and the test would turn green comparing
    // nothing with nothing.
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
    // The selector displays these labels and only these: a locale without an endonym
    // would show up there as an empty, clickable row.
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

  it('porte la MÊME étiquette `Intl` des deux côtés de la cloison', () => {
    // Convex does not have the `@/` alias: the table of regional tags is
    // copied into `convex/lib/locales.ts`, as the list of languages already
    // is. They must say the same thing, otherwise a reminder email
    // would format its date differently from the event page it announces —
    // and the `ar-MA` decision (Western Arabic numerals) would apply to the
    // site but not to emails, which would announce "٢٠٢٦".
    for (const l of routing.locales) {
      expect(intlTag(l), `étiquette Intl divergente pour « ${l} »`).toBe(
        intlLocale(l),
      );
    }
  });
});
