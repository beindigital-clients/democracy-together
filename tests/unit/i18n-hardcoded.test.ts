import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import fr from '../../src/messages/fr.json';
import en from '../../src/messages/en.json';

// Garde anti-régression : texte français codé en dur, y compris pour un
// lecteur anglophone (audit § 5.3, issue #34).
//
// Le dépôt revendiquait une parité i18n parfaite — un comptage de clés FR/EN.
// Ce comptage ne dit rien des chaînes qui n'entrent JAMAIS dans le fichier de
// messages : dix ternaires `locale === 'en' ? … : …` posaient le libellé
// directement dans le JSX, et deux `aria-label` étaient écrits en français
// quelle que soit la langue. Ni traduisibles par l'équipe, ni comptés dans la
// parité, ni disponibles pour une troisième langue.
//
// Le cas le plus sérieux était l'`aria-label` du lien vers l'accueil, présent
// sur TOUTES les pages : une synthèse vocale anglaise y annonçait « accueil ».
// Un défaut invisible à l'œil — c'est précisément ce qu'un test attrape.
//
// Ce fichier tient quatre contrats. Les trois premiers lisent les SOURCES :
// aucun typecheck ni test de rendu ne les vérifierait. Le quatrième compare
// les deux fichiers de messages.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const SRC = join(process.cwd(), 'src');
const COMPONENTS = walk(SRC).map((file) => ({
  path: relative(process.cwd(), file),
  src: readFileSync(file, 'utf8'),
}));

// Une étiquette de langue BCP-47 (`en`, `fr-FR`, `en-GB`) n'est pas du texte :
// c'est un paramètre passé à `Intl`. Un ternaire de locale a le droit d'en
// choisir une ; il n'a pas le droit de choisir une phrase.
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z]{2,4})*$/;

// `aria-label` suivi d'un littéral : `"…"`, `'…'`, ou `{'…'}` / `{`…`}`. Un
// `{t('x')}` ou un gabarit qui interpole (`{`${a} — ${b}`}`) ne correspond pas
// — le premier parce qu'il n'ouvre pas sur un guillemet, le second parce qu'on
// écarte ensuite tout ce qui contient `${`.
const LITERAL_ARIA_LABEL =
  /aria-label\s*=\s*("[^"]*"|'[^']*'|\{\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*\})/g;

// Comparaison d'une locale à une langue servie, suivie d'un ternaire dont LES
// DEUX branches sont des littéraux. Un ternaire qui choisit entre deux tables
// de contenu (`locale === 'en' ? en : fr`) ne correspond pas : ses branches
// sont des identifiants, et c'est le mécanisme i18n légitime du dépôt.
const LOCALE_TERNARY =
  /\w*(?:locale|loc)\s*===\s*'(?:en|fr)'\s*\?\s*('[^']*'|"[^"]*"|`[^`]*`)\s*:\s*('[^']*'|"[^"]*"|`[^`]*`)/gi;

// L'équivalent exact du `grep` de l'issue #34, appliqué aux mêmes fichiers.
const LOCALE_TERNARY_ISSUE_34 = /\blocale\s*===\s*'en'/;

function unquote(literal: string): string {
  return literal.slice(1, -1);
}

describe('i18n — aucun texte annoncé codé en dur (issue #34)', () => {
  it("un `aria-label` n'est jamais un littéral : son texte vient de l'i18n", () => {
    const offenders: string[] = [];
    for (const { path, src } of COMPONENTS) {
      for (const [, value] of src.matchAll(LITERAL_ARIA_LABEL)) {
        // Un gabarit interpolé assemble des valeurs traduites : il est bon.
        if (value.includes('${')) continue;
        offenders.push(`${path} -> aria-label=${value}`);
      }
    }
    expect(
      offenders,
      `Un \`aria-label\` est le SEUL nom accessible d'un élément sans texte : écrit\n` +
        `en dur, il est annoncé tel quel dans toutes les langues. Passer par une clé\n` +
        `de messages (ou la table de libellés de la page) :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('i18n — aucun libellé choisi par un ternaire de locale (issue #34)', () => {
  it('un ternaire de locale choisit une étiquette de langue, jamais une phrase', () => {
    const offenders: string[] = [];
    for (const { path, src } of COMPONENTS) {
      for (const [match, left, right] of src.matchAll(LOCALE_TERNARY)) {
        const branches = [unquote(left), unquote(right)];
        if (branches.every((b) => LANGUAGE_TAG.test(b.trim()))) continue;
        offenders.push(`${path} -> ${match.replace(/\s+/g, ' ')}`);
      }
    }
    expect(
      offenders,
      `Ces libellés n'entrent pas dans le fichier de messages : ni traduisibles par\n` +
        `l'équipe, ni comptés dans la parité, ni disponibles pour une 3e langue.\n` +
        `Les déplacer vers une clé de messages — et pour une LISTE, passer par\n` +
        `Intl.ListFormat plutôt que d'inventer une règle par langue :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it("le `grep` de l'issue ne renvoie plus rien : plus un seul `locale === 'en'`", () => {
    const offenders: string[] = [];
    for (const { path, src } of COMPONENTS) {
      src.split('\n').forEach((line, i) => {
        if (LOCALE_TERNARY_ISSUE_34.test(line)) {
          offenders.push(`${path}:${i + 1} -> ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Normaliser une locale ne s'écrit qu'à un seul endroit : resolveLocale() de\n` +
        `'@/i18n/locale' (issue #41). Et un libellé se lit dans les messages, pas\n` +
        `dans un ternaire :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('i18n — la description racine dépend de la langue (issue #34)', () => {
  it('`site.description` existe des deux côtés et diffère', () => {
    expect(fr.site.description.trim()).not.toBe('');
    expect(en.site.description.trim()).not.toBe('');
    // Deux descriptions identiques signeraient une traduction oubliée : c'est
    // celle-là que les moteurs de recherche affichent pour toute page /en
    // dépourvue de `generateMetadata` propre.
    expect(en.site.description).not.toBe(fr.site.description);
  });

  it('le layout la sert via `generateMetadata`, pas via un objet figé', () => {
    const layout = readFileSync(
      join(SRC, 'app', '[locale]', 'layout.tsx'),
      'utf8',
    );
    expect(layout).toContain('export async function generateMetadata');
    // Un `export const metadata` est STATIQUE : servi à l'identique sur /fr et
    // sur /en, c'est exactement le défaut corrigé ici.
    expect(layout).not.toMatch(/export const metadata/);
  });
});

// À NE PAS CONFONDRE avec `i18n-keys.test.ts` (issue #33), qui part du CODE :
// il vérifie que chaque clé demandée par un `t('…')` existe des deux côtés.
// Celle-ci part des FICHIERS et compare les deux jeux de clés. Une clé ajoutée
// au français et oubliée en anglais échappe à la première tant que rien ne la
// demande encore — c'est l'ordre habituel des choses quand on traduit avant
// d'écrire l'écran. Les deux se complètent ; aucune ne remplace l'autre.
describe('i18n — parité FR/EN du fichier de messages', () => {
  it('les deux fichiers portent exactement les mêmes clés', () => {
    const paths = (value: unknown, prefix = ''): string[] =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).flatMap(([k, v]) =>
            paths(v, prefix ? `${prefix}.${k}` : k),
          )
        : [prefix];

    const frKeys = paths(fr).sort();
    const enKeys = paths(en).sort();
    expect(enKeys.filter((k) => !frKeys.includes(k))).toEqual([]);
    expect(frKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});
