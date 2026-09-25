import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import {
  BASE_CLIENT_NAMESPACES,
  ADMIN_NAMESPACES,
  CLIENT_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// Ce qui part dans le NAVIGATEUR, recalculé depuis les sources (audit F-05).
//
// `src/i18n/client-namespaces.ts` restreint le catalogue transmis au
// fournisseur client. Une liste écrite à la main dérive : un composant client
// gagne un `useTranslations('press')`, personne ne met la liste à jour, et
// l'espace manquant ne casse RIEN à l'écran — `getMessageFallback` rend le
// dernier segment de la clé. Le défaut serait donc invisible en page, et
// seule la console le dirait.
//
// Ce test refait le calcul : il relit tous les fichiers `'use client'` de
// `src/`, relève les espaces qu'ils demandent, et exige que les listes soient
// exactement cet ensemble. Analyse par le compilateur TypeScript et non par
// une expression régulière, comme `i18n-keys.test.ts` : un appel dans un
// commentaire ou une chaîne fausserait un balayage de texte.

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

/** `'use client'` comme PREMIÈRE instruction du fichier. */
function porteLaDirective(source: ts.SourceFile): boolean {
  const premiere = source.statements[0];
  return (
    premiere !== undefined &&
    ts.isExpressionStatement(premiere) &&
    ts.isStringLiteral(premiere.expression) &&
    premiere.expression.text === 'use client'
  );
}

/** Résout un spécificateur d'import vers un fichier de `src/`, ou `null`. */
function resoudre(depuis: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(RACINE, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // paquet npm : hors du périmètre
  for (const suffixe of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
    const essai = base + suffixe;
    if (SOURCES.has(essai)) return essai;
  }
  return null;
}

/**
 * Fichiers qui s'exécutent dans le NAVIGATEUR.
 *
 * Pas seulement ceux qui portent `'use client'` : tout module importé depuis
 * une frontière client en fait partie, directive ou non. C'est le trou que ce
 * test avait d'abord — `site-footer.tsx` n'a pas de directive et appelle
 * pourtant `useTranslations`, ce qui aurait pu se lire « espace inutile côté
 * client » alors que la réponse dépend de QUI l'importe. On ferme donc la
 * transitivité plutôt que de se fier à la directive seule.
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

/** Espaces demandés par `useTranslations(...)` dans le code qui part au client. */
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
    // Témoin de l'instrument : un analyseur qui ne voit rien rendrait tous
    // les tests ci-dessous verts en n'ayant rien vérifié.
    expect(APPELS.length).toBeGreaterThan(20);
  });

  it('n’accepte QUE des espaces écrits en toutes lettres', () => {
    // Toute la liste se dérive statiquement : un `useTranslations(variable)`
    // la rendrait incalculable, et le manque ne se verrait pas à l'écran.
    const dynamiques = APPELS.filter((a) => a.espace === null);
    expect(dynamiques.map((a) => a.fichier)).toEqual([]);
  });

  it('liste EXACTEMENT les espaces demandés par les composants client', () => {
    const demandes = [...new Set(APPELS.map((a) => a.espace as string))].sort();
    expect(demandes).toEqual([...CLIENT_NAMESPACES].sort());
  });

  it('sépare la base et le back-office sans recouvrement ni oubli', () => {
    const base = new Set<string>(BASE_CLIENT_NAMESPACES);
    const admin = new Set<string>(ADMIN_NAMESPACES);
    for (const ns of admin) expect(base.has(ns)).toBe(false);
    expect([...CLIENT_NAMESPACES].sort()).toEqual([...base, ...admin].sort());
  });

  it('ne garde dans le back-office que ce qu’AUCUNE page publique ne demande', () => {
    // Si un composant client hors `admin/` demandait un espace réservé au
    // back-office, la page publique afficherait le dernier segment de la clé
    // sans rien dire. C'est la condition qui rend le retrait sûr.
    const fautifs = APPELS.filter(
      (a) =>
        a.espace !== null &&
        (ADMIN_NAMESPACES as readonly string[]).includes(a.espace) &&
        !a.fichier.includes('admin'),
    );
    expect(fautifs.map((a) => `${a.fichier} -> ${a.espace}`)).toEqual([]);
  });

  it('ne nomme aucun espace absent des deux catalogues', () => {
    // Une faute de frappe dans la liste ne transmettrait rien, en silence.
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
    // `{ presse: undefined }` serait lu par next-intl comme un espace vide et
    // masquerait la faute ; son absence, elle, fait parler le repli.
    const choisi = pickNamespaces(fr, ['nav', 'espace-qui-nexiste-pas']);
    expect(Object.keys(choisi)).toEqual(['nav']);
    expect('espace-qui-nexiste-pas' in choisi).toBe(false);
  });

  it('allège réellement le catalogue', () => {
    const entier = JSON.stringify(fr).length;
    const publiques = JSON.stringify(
      pickNamespaces(fr, BASE_CLIENT_NAMESPACES),
    ).length;
    // Mesuré au moment du correctif : 45 320 -> 24 929 octets.
    expect(publiques).toBeLessThan(entier * 0.7);
  });
});
