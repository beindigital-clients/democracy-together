import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { routing } from '@/i18n/routing';

// Translation key parity guard (issue #33).
//
// FR/EN parity was already checked — 846 keys on each side — but it said
// NOTHING about keys referenced in the code and defined in neither of the
// two languages. With the old `getMessageFallback`, such a key was displayed
// on the page as its last segment: a missing `t('library.detail.
// notFoundTitle')` rendered "notFoundTitle", without a word in the
// console. This test reads the SOURCE CODE — as `reveal-nojs.test.ts` walks
// `src/` and `convex/dev-oracles.test.ts` re-reads its oracles — and matches
// each key against `fr.json` and `en.json`.
//
// It also holds the contract that allows `getMessageFallback` to be strict
// (src/i18n/message-errors.ts):
//
//   literal key, written in full   -> `t('detail.notFoundTitle')`   checked here
//   key built at runtime           -> `vocabulary(t, 'themes.', s)` explicit fallback
//
// The analysis goes through the TypeScript compiler rather than a regular
// expression: a key in a comment, a French apostrophe in
// JSX or a nested template literal would skew a simple text
// scan, and a guard aimed at the wrong target guards nothing.

const SRC = join(process.cwd(), 'src');
const MESSAGES = join(SRC, 'messages');

const TRANSLATOR_FACTORIES = new Set(['useTranslations', 'getTranslations']);
// `has` is a query, not a label request: it requires no key.
const TRANSLATOR_METHODS = new Set(['rich', 'markup', 'raw']);

// Calls whose key is neither a literal nor routed through `vocabulary()`:
// a `key` value taken from an `as const` array iterated with `.map()`. The
// vocabulary there is closed and written in the same repo, but out of reach of
// this guard — the nav entry lives in `site-header.tsx`, the label is
// requested in `nav-links.tsx`. This list makes them VISIBLE: a new
// call of this kind makes the test fail, and one must then either write the key
// in full, go through `vocabulary()`, or add it here explaining
// why the key cannot be a literal.
const CLES_NON_LITTERALES = [
  'src/app/[locale]/adhesion/page.tsx -> t(k)',
  'src/app/[locale]/admin/impact/page.tsx -> t(c.key)',
  'src/app/[locale]/admin/page.tsx -> t(c.key)',
  // The back-office navigation left the shell for `admin-nav.tsx`
  // (issue #49): the entries table lives there, the label is requested there. Both
  // calls iterate over `ADMIN_NAV_GROUPS`, closed and written in this same
  // repo; `tests/unit/admin-nav.test.tsx` checks that each of its keys —
  // entries and group headings — exists in French AND in English.
  'src/components/admin/admin-nav.tsx -> t(group.labelKey)',
  'src/components/admin/admin-nav.tsx -> t(key)',
  // Per-screen tab title (RGAA 8.6): the key comes from `adminScreenKey`,
  // which only returns keys from that same `ADMIN_NAV_GROUPS` table.
  'src/components/admin/admin-shell.tsx -> t(key)',
  'src/components/layout/mobile-nav.tsx -> t(item.key)',
  'src/components/layout/nav-links.tsx -> t(key)',
];

type Site = { file: string; line: number; label: string };
type KeySite = Site & { path: string };
type PrefixSite = Site & { namespace: string; prefix: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}

function repoPath(file: string): string {
  return relative(process.cwd(), file).split(sep).join('/');
}

// Namespace of a `useTranslations('x')` / `getTranslations({ namespace: 'x' })`.
function namespaceOf(call: ts.CallExpression): string | undefined {
  const arg = call.arguments[0];
  if (!arg) return '';
  if (ts.isStringLiteral(arg)) return arg.text;
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        prop.name.getText() === 'namespace' &&
        ts.isStringLiteral(prop.initializer)
      ) {
        return prop.initializer.text;
      }
    }
  }
  return undefined;
}

// The literal keys of an argument. A ternary between two literals
// (`t(pending ? 'filterPending' : 'filterAll')`) carries two.
function literalKeys(arg: ts.Expression): string[] {
  if (ts.isStringLiteral(arg)) return [arg.text];
  if (ts.isConditionalExpression(arg)) {
    const branches = [arg.whenTrue, arg.whenFalse].flatMap(literalKeys);
    return branches.length === 2 ? branches : [];
  }
  return [];
}

function isTemplate(arg: ts.Expression): boolean {
  return (
    ts.isTemplateExpression(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
  );
}

const keys: KeySite[] = [];
const prefixes: PrefixSite[] = [];
const gabarits: Site[] = [];
const nonLitterales: Site[] = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // 1. The translators bound in this file, with their position: the same name
  //    can denote two namespaces in two components of the same file
  //    (`espace-membre/page.tsx` binds `t` to `auth` then to `library`). The
  //    binding used for a call is the closest one preceding it.
  const bindings: Array<{ name: string; namespace: string; at: number }> = [];
  const collectBindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      let init = node.initializer;
      if (init && ts.isAwaitExpression(init)) init = init.expression;
      if (
        init &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        TRANSLATOR_FACTORIES.has(init.expression.text)
      ) {
        const namespace = namespaceOf(init);
        if (namespace !== undefined) {
          bindings.push({
            name: node.name.text,
            namespace,
            at: node.getStart(),
          });
        }
      }
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(source);
  if (bindings.length === 0) continue;

  const resolve = (name: string, at: number): string | undefined => {
    let found: string | undefined;
    for (const b of bindings) {
      if (b.name === name && b.at < at) found = b.namespace;
    }
    return found;
  };

  const site = (node: ts.Node, label: string): Site => ({
    file: repoPath(file),
    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    label,
  });

  // 2. The calls.
  const collectCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      // `vocabulary(t, 'themes.', slug)` — the prefix denotes a group.
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'vocabulary'
      ) {
        const [translator, prefix] = node.arguments;
        if (translator && ts.isIdentifier(translator) && prefix) {
          const namespace = resolve(translator.text, node.getStart());
          // A prefix that is itself built (`\`${g.ns}.\``) cannot be
          // resolved here: the namespace depends on runtime.
          if (namespace !== undefined && ts.isStringLiteral(prefix)) {
            prefixes.push({
              ...site(node, `vocabulary(${translator.text}, '${prefix.text}')`),
              namespace,
              prefix: prefix.text,
            });
          }
        }
      }

      // `t('…')`, `t.rich('…')` — a translator bound in this file.
      const callee = node.expression;
      let name: string | undefined;
      if (ts.isIdentifier(callee)) name = callee.text;
      else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        TRANSLATOR_METHODS.has(callee.name.text)
      ) {
        name = callee.expression.text;
      }

      if (name !== undefined) {
        const namespace = resolve(name, node.getStart());
        const arg = node.arguments[0];
        if (namespace !== undefined && arg) {
          const found = literalKeys(arg);
          if (found.length > 0) {
            for (const key of found) {
              keys.push({
                ...site(node, `${name}('${key}')`),
                path: namespace ? `${namespace}.${key}` : key,
              });
            }
          } else if (isTemplate(arg)) {
            gabarits.push(site(node, `${name}(\`…\`)`));
          } else {
            nonLitterales.push(site(node, `${name}(${arg.getText()})`));
          }
        }
      }
    }
    ts.forEachChild(node, collectCalls);
  };
  collectCalls(source);
}

// The FIVE catalogs, derived from `routing.locales`: a key written in the
// code must exist in each, not only in French and English.
// This list used to be fixed at two languages; it would have stayed silent the day a
// key went missing from the Arabic catalog alone.
const LANGUES = routing.locales;
const catalogues = Object.fromEntries(
  LANGUES.map((l) => [
    l,
    JSON.parse(readFileSync(join(MESSAGES, `${l}.json`), 'utf8')) as unknown,
  ]),
) as Record<(typeof LANGUES)[number], unknown>;

function resolvePath(tree: unknown, path: string): unknown {
  let node = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

// A vocabulary group: `library.themes` (object), or the family of keys
// `admin.revStage_*` when the separator is an underscore.
function hasVocabularyGroup(
  tree: unknown,
  namespace: string,
  prefix: string,
): boolean {
  if (prefix.endsWith('.')) {
    const group = resolvePath(
      tree,
      `${namespace}${namespace ? '.' : ''}${prefix.slice(0, -1)}`,
    );
    return (
      typeof group === 'object' &&
      group !== null &&
      Object.keys(group).length > 0
    );
  }
  const group = namespace ? resolvePath(tree, namespace) : tree;
  if (typeof group !== 'object' || group === null) return false;
  return Object.keys(group).some((key) => key.startsWith(prefix));
}

const describeSite = (s: Site) => `${s.file}:${s.line} — ${s.label}`;

describe('Clés de traduction — le code et les messages disent la même chose', () => {
  it('chaque clé littérale existe en français ET en anglais', () => {
    const absentes = keys
      .filter((k) =>
        LANGUES.some(
          (langue) =>
            typeof resolvePath(catalogues[langue], k.path) !== 'string',
        ),
      )
      .map((k) => {
        const manquantes = LANGUES.filter(
          (langue) =>
            typeof resolvePath(catalogues[langue], k.path) !== 'string',
        );
        return `${describeSite(k)} -> ${k.path} (absente de ${manquantes.join(' et ')})`;
      });

    expect(
      absentes,
      `Ces clés sont demandées par le code et définies nulle part :\n${absentes.join('\n')}`,
    ).toEqual([]);
  });

  it('chaque préfixe de vocabulaire désigne un groupe qui existe', () => {
    // A wrong prefix would throw nothing: `vocabulary()` would humanize each
    // term silently, and an entire column would display as slugs.
    const orphelins = prefixes
      .filter((p) =>
        LANGUES.some(
          (langue) =>
            !hasVocabularyGroup(catalogues[langue], p.namespace, p.prefix),
        ),
      )
      .map(
        (p) =>
          `${describeSite(p)} -> ${p.namespace}.${p.prefix}* (aucun terme défini)`,
      );

    expect(
      orphelins,
      `Ces préfixes de vocabulaire ne désignent aucun libellé :\n${orphelins.join('\n')}`,
    ).toEqual([]);
  });

  it('aucune clé construite ne contourne vocabulary()', () => {
    // This contract is what allows `getMessageFallback` to be strict: if a
    // `t(`themes.${slug}`)` came back, a slug outside the dictionary would scream like
    // an interface bug — and the legitimate fallback would become noise again.
    const offenders = gabarits.map(describeSite);
    expect(
      offenders,
      `Clé construite à l'exécution passée directement au traducteur.\nUtiliser vocabulary(t, 'prefixe.', terme) — voir src/i18n/vocabulary.ts :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('les appels dont la clé n’est pas un littéral restent ceux qu’on connaît', () => {
    const vus = [
      ...new Set(nonLitterales.map((s) => `${s.file} -> ${s.label}`)),
    ].sort();
    expect(
      vus,
      'Un appel dont la clé n’est pas un littéral échappe à cette garde.\n' +
        'Écrire la clé en entier, passer par vocabulary(), ou compléter CLES_NON_LITTERALES en disant pourquoi.',
    ).toEqual(CLES_NON_LITTERALES);
  });
});

describe('Clés de traduction — la garde voit vraiment le code', () => {
  // A guard that no longer analyzes anything turns green silently. These two
  // checks hold the analysis itself.
  it('relève l’essentiel des clés du dépôt', () => {
    expect(keys.length).toBeGreaterThan(500);
    expect(prefixes.length).toBeGreaterThan(50);
    expect(new Set(keys.map((k) => k.file)).size).toBeGreaterThan(50);
  });

  it('rejette bien une clé absente', () => {
    expect(
      resolvePath(catalogues.fr, 'library.detail.notFoundTitle'),
    ).toBeUndefined();
    expect(typeof resolvePath(catalogues.fr, 'library.empty')).toBe('string');
    expect(hasVocabularyGroup(catalogues.fr, 'library', 'themes.')).toBe(true);
    expect(hasVocabularyGroup(catalogues.fr, 'library', 'inexistant.')).toBe(
      false,
    );
    expect(hasVocabularyGroup(catalogues.fr, 'admin', 'revStage_')).toBe(true);
    expect(hasVocabularyGroup(catalogues.fr, 'admin', 'revEtape_')).toBe(false);
  });
});
