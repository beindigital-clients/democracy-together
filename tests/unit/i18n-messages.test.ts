import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';

// PARITÉ ET VALIDITÉ DES CINQ CATALOGUES DE MESSAGES.
//
// `tests/unit/i18n-keys.test.ts` rapproche le CODE des catalogues : il attrape
// une clé demandée et définie nulle part. Il ne dit rien du CONTENU des
// valeurs, et c'est là que vivent les défauts propres à la traduction :
//
//  1. une clé traduite dans une langue et oubliée dans une autre ;
//  2. un `{title}` devenu `{titulo}` en passant en espagnol — le message
//     s'affiche alors avec l'accolade brute, et `next-intl` lève ;
//  3. un pluriel arabe écrit avec les catégories du français. L'arabe en a
//     SIX (zero, one, two, few, many, other) là où le français en a trois :
//     un `{count, plural, one {…} other {…}}` recopié tel quel rend « 3 منشور »
//     au lieu de « 3 منشورات ». Rien ne plante ; la phrase est simplement
//     fausse, et personne qui ne lit pas l'arabe ne le verra.
//
// POURQUOI UN ANALYSEUR ÉCRIT ICI et pas `@formatjs/icu-messageformat-parser` :
// ce paquet n'est qu'une dépendance TRANSITIVE de next-intl. L'ajouter aux
// devDependencies pour un test, ou le charger par son chemin dans le magasin
// pnpm (versionné), sont deux façons de rendre ce fichier fragile. Le balayage
// ci-dessous ne prétend pas parser l'ICU en entier : il compte les accolades et
// relève les noms d'arguments et de catégories, ce qui suffit exactement aux
// trois défauts listés. Les vérifications de la dernière section tiennent
// l'analyseur lui-même — sans elles, un balayage qui cesserait de trouver quoi
// que ce soit passerait au vert en comparant deux ensembles vides.

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

/** Les accolades d'un message sont-elles équilibrées ? */
function balanced(msg: string): boolean {
  let depth = 0;
  for (const ch of msg) {
    if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Index de l'accolade fermante appariée à celle ouverte en `open`. */
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
 * Relève les arguments et les catégories de pluriel d'un message ICU.
 *
 * LE BALAYAGE EST RÉCURSIF, et il doit l'être. Une accolade ICU ouvre DEUX
 * choses selon l'endroit où elle se trouve : un argument (`{count}`), ou le
 * corps d'une catégorie de pluriel (`one {…}`). Une expression régulière ne
 * distingue pas les deux, et la première version de cette garde l'a appris à
 * ses dépens : en français, `{count, plural, one {Notifications, # non lue} …}`
 * lui faisait lire « Notifications » comme un NOM D'ARGUMENT, parce que le
 * corps de la catégorie commence par un mot suivi d'une virgule. La garde
 * signalait alors une divergence entre le français et l'arabe là où c'était
 * elle qui se trompait.
 *
 * Ici, chaque `{` rencontré dans du TEXTE ouvre un argument : on lit son nom,
 * son type, puis — si c'est un pluriel ou un `select` — on découpe son corps en
 * couples « catégorie + accolade », et on redescend dans chaque accolade.
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
    if (close < 0) return into; // message déséquilibré : `balanced` le signale
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
            scan(body.slice(j + 1, catClose), into); // arguments imbriqués
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
      // `Intl.PluralRules` est la source de vérité CLDR : l'arabe y déclare
      // zero/one/two/few/many/other, le français one/many/other.
      const admises = new Set(
        new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      );
      const fautives: string[] = [];
      for (const [key, msg] of CATALOGUES.get(locale)!) {
        for (const cats of pluralCategories(msg)) {
          if (!cats.includes('other')) {
            fautives.push(`${key} — pluriel sans « other » (repli impossible)`);
          }
          for (const c of cats) {
            // `=0`, `=1`… sont des correspondances exactes, valides partout.
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

  it('l’arabe couvre ses catégories propres là où le français n’en a que deux', () => {
    // Vérification de FOND, pas de forme : que la traduction arabe ait bien
    // été écrite avec les règles de l'arabe, et non recopiée du français.
    // `library.count` est le cas type — il s'affiche sous chaque facette.
    const ar = CATALOGUES.get('ar')!.get('library.count');
    expect(ar, 'library.count absente du catalogue arabe').toBeDefined();
    const cats = pluralCategories(ar!)[0] ?? [];
    for (const attendue of ['one', 'two', 'few', 'many', 'other']) {
      expect(
        cats,
        `« ${attendue} » manque au pluriel arabe de library.count`,
      ).toContain(attendue);
    }
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
    // LE CAS QUI A FAIT ÉCHOUER LA PREMIÈRE VERSION : le corps d'une catégorie
    // commence par un mot suivi d'une virgule, et ressemble donc à un argument.
    expect([
      ...argumentsOf(
        '{count, plural, one {Notifications, # non lue} other {Notifications, # non lues}}',
      ),
    ]).toEqual(['count']);
    // Un vrai argument imbriqué dans une catégorie, lui, doit être vu.
    expect([
      ...argumentsOf(
        '{n, plural, one {{name} a répondu} other {{name} ont répondu}}',
      ),
    ]).toEqual(['n', 'name']);
    expect([...argumentsOf('aucun argument ici')]).toEqual([]);

    expect(
      pluralCategories('{c, plural, =0 {rien} one {# x} other {# y}}'),
    ).toEqual([['=0', 'one', 'other']]);
    // Un pluriel imbriqué dans une autre valeur reste vu comme un bloc.
    expect(
      pluralCategories(
        'Envoyer à {c, plural, one {# abonné} other {# abonnés}}',
      ),
    ).toEqual([['one', 'other']]);
    expect(pluralCategories('pas de pluriel')).toEqual([]);
  });
});
