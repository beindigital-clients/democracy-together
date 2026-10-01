import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import {
  BASE_CLIENT_NAMESPACES,
  ADMIN_NAMESPACES,
  MEMBER_NAMESPACES,
  CLIENT_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// What goes out to the BROWSER, recomputed from the sources (audit F-05).
//
// `src/i18n/client-namespaces.ts` restricts the catalog passed to the
// client provider. A hand-written list drifts: a client component
// gains a `useTranslations('press')`, nobody updates the list, and
// the missing namespace breaks NOTHING on screen — `getMessageFallback` renders the
// last segment of the key. The defect would therefore be invisible on the page, and
// only the console would say so.
//
// This test redoes the computation: it re-reads every `'use client'` file in
// `src/`, collects the namespaces they request, and requires the lists to be
// exactly that set. Analysis via the TypeScript compiler and not via
// a regular expression, like `i18n-keys.test.ts`: a call inside a
// comment or a string would skew a text scan.

const RACINE = join(process.cwd(), 'src');

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(chemin)) out.push(chemin);
  }
  return out;
}

const SOURCES = new Map<string, ts.SourceFile>();
for (const chemin of fichiers(RACINE)) {
  SOURCES.set(
    chemin,
    ts.createSourceFile(
      chemin,
      readFileSync(chemin, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  );
}

/** `'use client'` as the FIRST statement of the file. */
function porteLaDirective(source: ts.SourceFile): boolean {
  const premiere = source.statements[0];
  return (
    premiere !== undefined &&
    ts.isExpressionStatement(premiere) &&
    ts.isStringLiteral(premiere.expression) &&
    premiere.expression.text === 'use client'
  );
}

/** Resolves an import specifier to a file under `src/`, or `null`. */
function resoudre(depuis: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(RACINE, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // npm package: out of scope
  for (const suffixe of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
    const essai = base + suffixe;
    if (SOURCES.has(essai)) return essai;
  }
  return null;
}

/**
 * Files that run in the BROWSER.
 *
 * Not only those carrying `'use client'`: any module imported from
 * a client boundary is one of them, directive or not. That is the gap this
 * test had at first — `site-footer.tsx` has no directive and yet
 * calls `useTranslations`, which could have been read as "namespace unneeded on the
 * client" whereas the answer depends on WHO imports it. So we close the
 * transitivity rather than relying on the directive alone.
 */
function fermetureClient(): Set<string> {
  const vus = new Set<string>();
  const pile = [...SOURCES.keys()].filter((f) =>
    porteLaDirective(SOURCES.get(f) as ts.SourceFile),
  );
  while (pile.length > 0) {
    const f = pile.pop() as string;
    if (vus.has(f)) continue;
    vus.add(f);
    const source = SOURCES.get(f) as ts.SourceFile;
    const visiter = (n: ts.Node): void => {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier !== undefined &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const cible = resoudre(f, n.moduleSpecifier.text);
        if (cible !== null && !vus.has(cible)) pile.push(cible);
      }
      ts.forEachChild(n, visiter);
    };
    ts.forEachChild(source, visiter);
  }
  return vus;
}

type Appel = { fichier: string; espace: string | null };

/** Namespaces requested by `useTranslations(...)` in code shipped to the client. */
function appelsClient(): Appel[] {
  const appels: Appel[] = [];
  for (const chemin of fermetureClient()) {
    const source = SOURCES.get(chemin) as ts.SourceFile;
    const visiter = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'useTranslations'
      ) {
        const arg = n.arguments[0];
        appels.push({
          fichier: relative(process.cwd(), chemin),
          espace:
            arg !== undefined && ts.isStringLiteral(arg)
              ? (arg.text.split('.')[0] ?? null)
              : null,
        });
      }
      ts.forEachChild(n, visiter);
    };
    ts.forEachChild(source, visiter);
  }
  return appels;
}

const APPELS = appelsClient();

describe('Espaces de messages transmis au navigateur', () => {
  it('trouve bien des appels — sinon tout le reste passerait à vide', () => {
    // Control for the instrument: an analyzer that sees nothing would make all
    // the tests below green while having checked nothing.
    expect(APPELS.length).toBeGreaterThan(20);
  });

  it('n’accepte QUE des espaces écrits en toutes lettres', () => {
    // The whole list is derived statically: a `useTranslations(variable)`
    // would make it uncomputable, and the gap would not show on screen.
    const dynamiques = APPELS.filter((a) => a.espace === null);
    expect(dynamiques.map((a) => a.fichier)).toEqual([]);
  });

  it('liste EXACTEMENT les espaces demandés par les composants client', () => {
    const demandes = [...new Set(APPELS.map((a) => a.espace as string))].sort();
    expect(demandes).toEqual([...CLIENT_NAMESPACES].sort());
  });

  it('sépare la base, le back-office et l’espace membre sans recouvrement ni oubli', () => {
    const base = new Set<string>(BASE_CLIENT_NAMESPACES);
    const admin = new Set<string>(ADMIN_NAMESPACES);
    const member = new Set<string>(MEMBER_NAMESPACES);
    for (const ns of admin) expect(base.has(ns)).toBe(false);
    for (const ns of member) {
      expect(base.has(ns)).toBe(false);
      expect(admin.has(ns)).toBe(false);
    }
    expect([...CLIENT_NAMESPACES].sort()).toEqual(
      [...base, ...admin, ...member].sort(),
    );
  });

  it('ne garde dans l’espace membre que ce qu’AUCUNE autre page ne demande', () => {
    // `espace-membre/layout.tsx` is the only provider that sends these
    // namespaces to the browser: a component requesting one from another page
    // would render the last segment of each key, silently.
    const fautifs = APPELS.filter(
      (a) =>
        a.espace !== null &&
        (MEMBER_NAMESPACES as readonly string[]).includes(a.espace) &&
        !a.fichier.includes('espace-membre') &&
        !a.fichier.includes('components/member/'),
    );
    expect(fautifs.map((a) => `${a.fichier} -> ${a.espace}`)).toEqual([]);
  });

  it('ne garde dans le back-office que ce qu’AUCUNE page publique ne demande', () => {
    // If a client component outside `admin/` requested a namespace reserved for the
    // back office, the public page would display the last segment of the key
    // without saying anything. This is the condition that makes the removal safe.
    const fautifs = APPELS.filter(
      (a) =>
        a.espace !== null &&
        (ADMIN_NAMESPACES as readonly string[]).includes(a.espace) &&
        !a.fichier.includes('admin'),
    );
    expect(fautifs.map((a) => `${a.fichier} -> ${a.espace}`)).toEqual([]);
  });

  it('ne nomme aucun espace absent des deux catalogues', () => {
    // A typo in the list would transmit nothing, silently.
    for (const ns of CLIENT_NAMESPACES) {
      expect(Object.keys(fr), `${ns} absent de fr.json`).toContain(ns);
      expect(Object.keys(en), `${ns} absent de en.json`).toContain(ns);
    }
  });
});

describe('Restriction du catalogue', () => {
  it('ne garde que les espaces nommés', () => {
    const choisi = pickNamespaces(fr, ['nav', 'footer']);
    expect(Object.keys(choisi).sort()).toEqual(['footer', 'nav']);
  });

  it('IGNORE un espace inconnu au lieu de poser une valeur nulle', () => {
    // `{ presse: undefined }` would be read by next-intl as an empty namespace and
    // would hide the mistake; its absence, on the other hand, makes the fallback speak up.
    const choisi = pickNamespaces(fr, ['nav', 'espace-qui-nexiste-pas']);
    expect(Object.keys(choisi)).toEqual(['nav']);
    expect('espace-qui-nexiste-pas' in choisi).toBe(false);
  });

  it('allège réellement le catalogue', () => {
    const entier = JSON.stringify(fr).length;
    const publiques = JSON.stringify(
      pickNamespaces(fr, BASE_CLIENT_NAMESPACES),
    ).length;
    // Measured at the time of the fix: 45,320 -> 24,929 bytes.
    expect(publiques).toBeLessThan(entier * 0.7);
  });
});
