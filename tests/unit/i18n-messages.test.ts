import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';

// PARITY AND VALIDITY OF THE FIVE MESSAGE CATALOGS.
//
// `tests/unit/i18n-keys.test.ts` matches the CODE against the catalogs: it catches
// a key requested and defined nowhere. It says nothing about the CONTENT of the
// values, and that is where translation-specific defects live:
//
//  1. a key translated in one language and forgotten in another;
//  2. a `{title}` turned into `{titulo}` on the way into Spanish — the message
//     then displays with the raw brace, and `next-intl` throws;
//  3. an Arabic plural written with French categories. Arabic has
//     SIX (zero, one, two, few, many, other) where French has three:
//     a `{count, plural, one {…} other {…}}` copied as is renders "3 منشور"
//     instead of "3 منشورات". Nothing crashes; the sentence is simply
//     wrong, and nobody who does not read Arabic will see it.
//
// WHY A PARSER WRITTEN HERE and not `@formatjs/icu-messageformat-parser`:
// that package is only a TRANSITIVE dependency of next-intl. Adding it to
// devDependencies for a test, or loading it by its path in the (versioned)
// pnpm store, are two ways of making this file fragile. The scan
// below does not claim to parse ICU in full: it counts braces and
// collects argument and category names, which is exactly enough for the
// three listed defects. The checks in the last section hold
// the parser itself — without them, a scan that stopped finding anything
// would turn green comparing two empty sets.

const MESSAGES = join(process.cwd(), 'src', 'messages');

type Flat = Map<string, string>;

function flatten(node: unknown, prefix = '', out: Flat = new Map()): Flat {
  if (typeof node === 'string') {
    out.set(prefix, node);
    return out;
  }
  if (typeof node === 'object' && node !== null) {
    for (const [k, v] of Object.entries(node)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

function catalogue(locale: string): Flat {
  return flatten(
    JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')),
  );
}

/** Are a message's braces balanced? */
function balanced(msg: string): boolean {
  let depth = 0;
  for (const ch of msg) {
    if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Index of the closing brace matching the one opened at `open`. */
function matchingBrace(msg: string, open: number): number {
  let depth = 0;
  for (let i = open; i < msg.length; i++) {
    if (msg[i] === '{') depth++;
    else if (msg[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

type Scan = { args: Set<string>; plurals: string[][] };

/**
 * Collects the arguments and plural categories of an ICU message.
 *
 * THE SCAN IS RECURSIVE, and it has to be. An ICU brace opens TWO
 * things depending on where it sits: an argument (`{count}`), or the
 * body of a plural category (`one {…}`). A regular expression cannot
 * tell the two apart, and the first version of this guard learned that the
 * hard way: in French, `{count, plural, one {Notifications, # non lue} …}`
 * made it read "Notifications" as an ARGUMENT NAME, because the
 * category body starts with a word followed by a comma. The guard
 * then reported a divergence between French and Arabic where it was
 * the guard itself that was wrong.
 *
 * Here, every `{` met in TEXT opens an argument: we read its name,
 * its type, then — if it is a plural or a `select` — we split its body into
 * "category + brace" pairs, and recurse into each brace.
 */
function scan(
  msg: string,
  into: Scan = { args: new Set(), plurals: [] },
): Scan {
  let i = 0;
  while (i < msg.length) {
    if (msg[i] !== '{') {
      i++;
      continue;
    }
    const close = matchingBrace(msg, i);
    if (close < 0) return into; // unbalanced message: `balanced` reports it
    const inner = msg.slice(i + 1, close);
    const firstComma = inner.indexOf(',');
    const name = (firstComma < 0 ? inner : inner.slice(0, firstComma)).trim();
    if (name) into.args.add(name);

    if (firstComma >= 0) {
      const secondComma = inner.indexOf(',', firstComma + 1);
      const type = inner
        .slice(firstComma + 1, secondComma < 0 ? undefined : secondComma)
        .trim();
      if (
        secondComma >= 0 &&
        (type === 'plural' || type === 'selectordinal' || type === 'select')
      ) {
        const body = inner.slice(secondComma + 1);
        const cats: string[] = [];
        let j = 0;
        let word = '';
        while (j < body.length) {
          if (body[j] === '{') {
            const catClose = matchingBrace(body, j);
            if (catClose < 0) break;
            if (word.trim()) cats.push(word.trim());
            word = '';
            scan(body.slice(j + 1, catClose), into); // nested arguments
            j = catClose + 1;
            continue;
          }
          word += body[j];
          j++;
        }
        if (type !== 'select') into.plurals.push(cats);
      }
    }
    i = close + 1;
  }
  return into;
}

function argumentsOf(msg: string): Set<string> {
  return scan(msg).args;
}

function pluralCategories(msg: string): string[][] {
  return scan(msg).plurals;
}

const CATALOGUES = new Map(routing.locales.map((l) => [l, catalogue(l)]));
const REFERENCE = CATALOGUES.get(routing.defaultLocale)!;

describe('Catalogues de messages — parité', () => {
  it.each(routing.locales.filter((l) => l !== routing.defaultLocale))(
    '%s définit exactement les mêmes clés que le français',
    (locale) => {
      const other = CATALOGUES.get(locale)!;
      const manquantes = [...REFERENCE.keys()].filter((k) => !other.has(k));
      const enTrop = [...other.keys()].filter((k) => !REFERENCE.has(k));
      expect(
        { manquantes, enTrop },
        `Écart de clés entre fr.json et ${locale}.json`,
      ).toEqual({ manquantes: [], enTrop: [] });
    },
  );

  it.each(routing.locales)('%s ne laisse aucune valeur vide', (locale) => {
    const vides = [...CATALOGUES.get(locale)!.entries()]
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    expect(vides).toEqual([]);
  });
});

describe('Catalogues de messages — syntaxe ICU', () => {
  it.each(routing.locales)(
    '%s : toutes les accolades sont équilibrées',
    (locale) => {
      const cassées = [...CATALOGUES.get(locale)!.entries()]
        .filter(([, v]) => !balanced(v))
        .map(([k, v]) => `${k} -> ${v}`);
      expect(cassées).toEqual([]);
    },
  );

  it.each(routing.locales.filter((l) => l !== routing.defaultLocale))(
    '%s : les arguments sont les mêmes qu’en français',
    (locale) => {
      const divergents: string[] = [];
      for (const [key, ref] of REFERENCE) {
        const traduit = CATALOGUES.get(locale)!.get(key);
        if (traduit === undefined) continue;
        const attendus = argumentsOf(ref);
        const trouvés = argumentsOf(traduit);
        const manquants = [...attendus].filter((a) => !trouvés.has(a));
        const enTrop = [...trouvés].filter((a) => !attendus.has(a));
        if (manquants.length || enTrop.length) {
          divergents.push(
            `${key} — manquants [${manquants.join(', ')}] en trop [${enTrop.join(', ')}] : « ${traduit} »`,
          );
        }
      }
      expect(
        divergents,
        'Un argument renommé ou perdu s’affiche en accolade brute dans la page',
      ).toEqual([]);
    },
  );

  it.each(routing.locales)(
    '%s : les catégories de pluriel existent dans cette langue',
    (locale) => {
      // `Intl.PluralRules` is the CLDR source of truth: Arabic declares
      // zero/one/two/few/many/other there, French one/many/other.
      // `Set<string>` and not `Set<LDMLPluralRule>`: the categories collected
      // from the messages are arbitrary strings — that is exactly what
      // we are checking. Comparing two typed sets would amount to assuming
      // valid what the test must establish.
      const admises: ReadonlySet<string> = new Set<string>(
        new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      );
      const fautives: string[] = [];
      for (const [key, msg] of CATALOGUES.get(locale)!) {
        for (const cats of pluralCategories(msg)) {
          if (!cats.includes('other')) {
            fautives.push(`${key} — pluriel sans « other » (repli impossible)`);
          }
          for (const c of cats) {
            // `=0`, `=1`… are exact matches, valid everywhere.
            if (c.startsWith('=')) continue;
            if (!admises.has(c)) {
              fautives.push(
                `${key} — « ${c} » n’existe pas en ${locale} (admises : ${[...admises].join(', ')})`,
              );
            }
          }
        }
      }
      expect(fautives).toEqual([]);
    },
  );

  it('l’arabe couvre ses catégories propres dans TOUS ses messages à pluriel', () => {
    // A check of SUBSTANCE, not form: that Arabic plurals were
    // written with Arabic rules, and not copied from French.
    //
    // THIS TEST ONLY COVERED `library.count`, "the typical case". The fifteen
    // other plural messages were only covered by the validity check
    // above — which accepts `one`/`other`, since those two
    // categories EXIST in Arabic. In other words: a regression bringing
    // `experts.count` back to French's three categories would have passed CI, and
    // the page would have displayed "3 منشور" instead of "3 منشورات". It was the
    // translator's quality that held those fifteen keys, not the guard.
    //
    // Arabic is the only language where the requirement applies to every message:
    // its six categories really change the word (dual, small-number
    // plural, accusative for 11–99), whereas the French or Spanish `many` only
    // serves compact notation and is legitimately missing almost everywhere.
    const REQUISES = ['one', 'two', 'few', 'many', 'other'];
    const incomplets: string[] = [];
    let pluriels = 0;

    for (const [key, msg] of CATALOGUES.get('ar')!) {
      for (const cats of pluralCategories(msg)) {
        pluriels++;
        const manquantes = REQUISES.filter((c) => !cats.includes(c));
        if (manquantes.length > 0) {
          incomplets.push(`${key} — manque : ${manquantes.join(', ')}`);
        }
      }
    }

    // A guard that finds no plural message guards nothing: if the
    // collection breaks, this test must fail here rather than pass vacuously.
    expect(
      pluriels,
      'aucun message à pluriel relevé dans le catalogue arabe',
    ).toBeGreaterThan(10);
    expect(incomplets).toEqual([]);
  });
});

describe('Catalogues de messages — la garde voit vraiment les messages', () => {
  it('relève l’essentiel du catalogue', () => {
    expect(REFERENCE.size).toBeGreaterThan(1000);
    for (const locale of routing.locales) {
      expect(CATALOGUES.get(locale)!.size).toBe(REFERENCE.size);
    }
  });

  it('les analyseurs répondent juste sur des cas connus', () => {
    expect(balanced('{a} et {b}')).toBe(true);
    expect(balanced('{a et {b}')).toBe(false);
    expect(balanced('a} {b}')).toBe(false);

    expect([...argumentsOf('Bonjour {name}, vous avez {n} messages')]).toEqual([
      'name',
      'n',
    ]);
    expect([
      ...argumentsOf('{count, plural, one {# vu} other {# vus}}'),
    ]).toEqual(['count']);
    // THE CASE THAT BROKE THE FIRST VERSION: a category body
    // starts with a word followed by a comma, and therefore looks like an argument.
    expect([
      ...argumentsOf(
        '{count, plural, one {Notifications, # non lue} other {Notifications, # non lues}}',
      ),
    ]).toEqual(['count']);
    // A real argument nested in a category, however, must be seen.
    expect([
      ...argumentsOf(
        '{n, plural, one {{name} a répondu} other {{name} ont répondu}}',
      ),
    ]).toEqual(['n', 'name']);
    expect([...argumentsOf('aucun argument ici')]).toEqual([]);

    expect(
      pluralCategories('{c, plural, =0 {rien} one {# x} other {# y}}'),
    ).toEqual([['=0', 'one', 'other']]);
    // A plural nested in another value is still seen as a block.
    expect(
      pluralCategories(
        'Envoyer à {c, plural, one {# abonné} other {# abonnés}}',
      ),
    ).toEqual([['one', 'other']]);
    expect(pluralCategories('pas de pluriel')).toEqual([]);
  });
});
