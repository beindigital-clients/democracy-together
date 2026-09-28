import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import fr from '../../src/messages/fr.json';
import en from '../../src/messages/en.json';

// Anti-regression guard: hard-coded French text, including for an
// English-speaking reader (audit § 5.3, issue #34).
//
// The repo claimed perfect i18n parity — an FR/EN key count.
// That count says nothing about strings that NEVER enter the messages
// file: ten `locale === 'en' ? … : …` ternaries put the label
// directly in the JSX, and two `aria-label`s were written in French
// whatever the language. Neither translatable by the team, nor counted in
// parity, nor available for a third language.
//
// The most serious case was the `aria-label` of the home link, present
// on EVERY page: an English speech synthesizer announced "accueil" there.
// A defect invisible to the eye — precisely what a test catches.
//
// This file holds four contracts. The first three read the SOURCES:
// no typecheck or render test would verify them. The fourth compares
// the two messages files.

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

// A BCP-47 language tag (`en`, `fr-FR`, `en-GB`) is not text:
// it is a parameter passed to `Intl`. A locale ternary is allowed to
// pick one; it is not allowed to pick a sentence.
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z]{2,4})*$/;

// `aria-label` followed by a literal: `"…"`, `'…'`, or `{'…'}` / `{`…`}`. A
// `{t('x')}` or an interpolating template (`{`${a} — ${b}`}`) does not match
// — the former because it does not open on a quote, the latter because we
// then exclude anything containing `${`.
const LITERAL_ARIA_LABEL =
  /aria-label\s*=\s*("[^"]*"|'[^']*'|\{\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*\})/g;

// Comparison of a locale with a served language, followed by a ternary whose
// BOTH branches are literals. A ternary choosing between two content
// tables (`locale === 'en' ? en : fr`) does not match: its branches
// are identifiers, and that is the repo's legitimate i18n mechanism.
const LOCALE_TERNARY =
  /\w*(?:locale|loc)\s*===\s*'(?:en|fr)'\s*\?\s*('[^']*'|"[^"]*"|`[^`]*`)\s*:\s*('[^']*'|"[^"]*"|`[^`]*`)/gi;

// The exact equivalent of the `grep` from issue #34, applied to the same files.
const LOCALE_TERNARY_ISSUE_34 = /\blocale\s*===\s*'en'/;

function unquote(literal: string): string {
  return literal.slice(1, -1);
}

describe('i18n — aucun texte annoncé codé en dur (issue #34)', () => {
  it("un `aria-label` n'est jamais un littéral : son texte vient de l'i18n", () => {
    const offenders: string[] = [];
    for (const { path, src } of COMPONENTS) {
      for (const [, value] of src.matchAll(LITERAL_ARIA_LABEL)) {
        // An interpolated template assembles translated values: it is fine.
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
    // Two identical descriptions would betray a forgotten translation: it is
    // that one that search engines display for any /en page
    // lacking its own `generateMetadata`.
    expect(en.site.description).not.toBe(fr.site.description);
  });

  it('le layout la sert via `generateMetadata`, pas via un objet figé', () => {
    const layout = readFileSync(
      join(SRC, 'app', '[locale]', 'layout.tsx'),
      'utf8',
    );
    expect(layout).toContain('export async function generateMetadata');
    // An `export const metadata` is STATIC: served identically on /fr and
    // on /en, it is exactly the defect fixed here.
    expect(layout).not.toMatch(/export const metadata/);
  });
});

// NOT TO BE CONFUSED with `i18n-keys.test.ts` (issue #33), which starts from the CODE:
// it checks that every key requested by a `t('…')` exists on both sides.
// This one starts from the FILES and compares the two key sets. A key added
// to French and forgotten in English escapes the former as long as nothing
// requests it yet — the usual order of things when translating before
// writing the screen. The two complement each other; neither replaces the other.
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
