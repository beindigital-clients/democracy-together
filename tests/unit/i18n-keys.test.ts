import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

// Garde de parité des clés de traduction (issue #33).
//
// La parité FR/EN était déjà vérifiée — 846 clés de chaque côté — mais elle ne
// disait RIEN des clés référencées dans le code et définies dans aucune des
// deux langues. Avec l'ancien `getMessageFallback`, une telle clé s'affichait
// en page sous la forme de son dernier segment : `t('library.detail.
// notFoundTitle')` manquante rendait « notFoundTitle », sans un mot dans la
// console. Ce test lit le CODE SOURCE — comme `reveal-nojs.test.ts` parcourt
// `src/` et `convex/dev-oracles.test.ts` relit ses oracles — et rapproche
// chaque clé de `fr.json` et `en.json`.
//
// Il tient aussi le contrat qui permet à `getMessageFallback` d'être strict
// (src/i18n/message-errors.ts) :
//
//   clé littérale, écrite en entier   -> `t('detail.notFoundTitle')`   vérifiée ici
//   clé construite à l'exécution      -> `vocabulary(t, 'themes.', s)` repli explicite
//
// L'analyse passe par le compilateur TypeScript plutôt que par une expression
// régulière : une clé dans un commentaire, une apostrophe française dans du
// JSX ou un littéral gabarit imbriqué fausseraient un simple balayage de
// texte, et une garde qui se trompe de cible ne garde rien.

const SRC = join(process.cwd(), 'src');
const MESSAGES = join(SRC, 'messages');

const TRANSLATOR_FACTORIES = new Set(['useTranslations', 'getTranslations']);
// `has` est une interrogation, pas une demande de libellé : elle n'exige aucune clé.
const TRANSLATOR_METHODS = new Set(['rich', 'markup', 'raw']);

// Appels dont la clé n'est ni un littéral ni un passage par `vocabulary()` :
// une valeur `key` issue d'un tableau `as const` parcouru en `.map()`. Le
// vocabulaire y est fermé et écrit dans le même dépôt, mais hors de portée de
// cette garde — l'entrée de nav vit dans `site-header.tsx`, le libellé est
// demandé dans `nav-links.tsx`. Cette liste les rend VISIBLES : un nouvel
// appel de ce genre fait échouer le test, et il faut alors soit écrire la clé
// en entier, soit passer par `vocabulary()`, soit l'ajouter ici en expliquant
// pourquoi la clé ne peut pas être littérale.
const CLES_NON_LITTERALES = [
  'src/app/[locale]/adhesion/page.tsx -> t(k)',
  'src/app/[locale]/admin/impact/page.tsx -> t(c.key)',
  'src/app/[locale]/admin/page.tsx -> t(c.key)',
  // La navigation du back-office a quitté la coquille pour `admin-nav.tsx`
  // (issue #49) : la table des entrées y vit, le libellé y est demandé. Les
  // deux appels parcourent `ADMIN_NAV_GROUPS`, fermée et écrite dans ce même
  // dépôt ; `tests/unit/admin-nav.test.tsx` vérifie que chacune de ses clés —
  // entrées et titres de groupe — existe en français ET en anglais.
  'src/components/admin/admin-nav.tsx -> t(group.labelKey)',
  'src/components/admin/admin-nav.tsx -> t(key)',
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

// Espace de noms d'un `useTranslations('x')` / `getTranslations({ namespace: 'x' })`.
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

// Les clés littérales d'un argument. Un ternaire entre deux littéraux
// (`t(pending ? 'filterPending' : 'filterAll')`) en porte deux.
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

  // 1. Les traducteurs liés dans ce fichier, avec leur position : un même nom
  //    peut désigner deux espaces de noms dans deux composants du même fichier
  //    (`espace-membre/page.tsx` lie `t` à `auth` puis à `library`). La
  //    liaison retenue pour un appel est la plus proche qui le précède.
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

  // 2. Les appels.
  const collectCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      // `vocabulary(t, 'themes.', slug)` — le préfixe désigne un groupe.
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'vocabulary'
      ) {
        const [translator, prefix] = node.arguments;
        if (translator && ts.isIdentifier(translator) && prefix) {
          const namespace = resolve(translator.text, node.getStart());
          // Un préfixe lui-même construit (`\`${g.ns}.\``) n'est pas
          // résoluble ici : l'espace de noms dépend de l'exécution.
          if (namespace !== undefined && ts.isStringLiteral(prefix)) {
            prefixes.push({
              ...site(node, `vocabulary(${translator.text}, '${prefix.text}')`),
              namespace,
              prefix: prefix.text,
            });
          }
        }
      }

      // `t('…')`, `t.rich('…')` — un traducteur lié dans ce fichier.
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

const catalogues = {
  fr: JSON.parse(readFileSync(join(MESSAGES, 'fr.json'), 'utf8')) as unknown,
  en: JSON.parse(readFileSync(join(MESSAGES, 'en.json'), 'utf8')) as unknown,
};

function resolvePath(tree: unknown, path: string): unknown {
  let node = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

// Un groupe de vocabulaire : `library.themes` (objet), ou la famille des clés
// `admin.revStage_*` quand le séparateur est un souligné.
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
        (['fr', 'en'] as const).some(
          (langue) =>
            typeof resolvePath(catalogues[langue], k.path) !== 'string',
        ),
      )
      .map((k) => {
        const manquantes = (['fr', 'en'] as const).filter(
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
    // Un préfixe fautif ne lèverait rien : `vocabulary()` humaniserait chaque
    // terme en silence, et toute une colonne s'afficherait en slugs.
    const orphelins = prefixes
      .filter((p) =>
        (['fr', 'en'] as const).some(
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
    // C'est ce contrat qui autorise `getMessageFallback` à être strict : si un
    // `t(`themes.${slug}`)` revenait, un slug hors dictionnaire crierait comme
    // un bug d'interface — et le repli légitime redeviendrait du bruit.
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
  // Une garde qui n'analyse plus rien passe au vert en silence. Ces deux
  // vérifications tiennent l'analyse elle-même.
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
