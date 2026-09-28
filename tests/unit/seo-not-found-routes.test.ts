import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  KNOWN_LOCALE_SEGMENTS,
  NOT_FOUND_SEGMENT,
  notFoundRewriteFor,
} from '@/lib/not-found-routes';

// The list of first segments known to the middleware (R-04) must reflect
// the ACTUAL folders of `src/app/[locale]/`: a folder added without its entry
// would respond 404 in production.
const LOCALE_DIR = join(process.cwd(), 'src', 'app', '[locale]');
const realSegments = readdirSync(LOCALE_DIR)
  .filter((entry) => statSync(join(LOCALE_DIR, entry)).isDirectory())
  .filter((entry) => entry !== NOT_FOUND_SEGMENT)
  .sort();

describe('404 par réécriture — segments connus (R-04)', () => {
  it('la liste écrite dans le middleware est exactement celle des dossiers de [locale]', () => {
    expect([...KNOWN_LOCALE_SEGMENTS].sort()).toEqual(realSegments);
  });

  it('la page « introuvable » existe et n’est PAS un segment connu', () => {
    expect(statSync(join(LOCALE_DIR, NOT_FOUND_SEGMENT)).isDirectory()).toBe(
      true,
    );
    expect(KNOWN_LOCALE_SEGMENTS).not.toContain(NOT_FOUND_SEGMENT);
  });
});

describe('404 par réécriture — notFoundRewriteFor (R-04)', () => {
  it('réécrit un premier segment inconnu sous chaque langue servie', () => {
    expect(notFoundRewriteFor('/fr/nimporte-quoi')).toBe('/fr/introuvable');
    expect(notFoundRewriteFor('/ar/xyz')).toBe('/ar/introuvable');
    expect(notFoundRewriteFor('/en/library')).toBe('/en/introuvable');
    expect(notFoundRewriteFor('/pt/xyz/abc')).toBe('/pt/introuvable');
    // Direct visit to the "not found" page: 404 too.
    expect(notFoundRewriteFor('/es/introuvable')).toBe('/es/introuvable');
  });

  it('laisse passer les routes connues, l’accueil et les chemins hors langue', () => {
    expect(notFoundRewriteFor('/fr')).toBeNull();
    expect(notFoundRewriteFor('/fr/')).toBeNull();
    expect(notFoundRewriteFor('/fr/bibliotheque')).toBeNull();
    expect(notFoundRewriteFor('/ar/le-reseau/institut-sahel')).toBeNull();
    expect(notFoundRewriteFor('/fr/admin/contact')).toBeNull();
    // Without a language prefix: next-intl redirects first.
    expect(notFoundRewriteFor('/xx')).toBeNull();
    expect(notFoundRewriteFor('/de')).toBeNull();
    expect(notFoundRewriteFor('/')).toBeNull();
    expect(notFoundRewriteFor('/api/auth')).toBeNull();
    expect(notFoundRewriteFor('/studio')).toBeNull();
    expect(notFoundRewriteFor('/sitemap.xml')).toBeNull();
    expect(notFoundRewriteFor('/icon.png')).toBeNull();
    expect(notFoundRewriteFor('/_next/static/x.js')).toBeNull();
  });

  it('un segment vide ou nul sous une route connue est un 404 (vitrine O4)', () => {
    expect(notFoundRewriteFor('/fr/le-reseau/%00')).toBe('/fr/introuvable');
    expect(notFoundRewriteFor('/fr/bibliotheque/%00')).toBe('/fr/introuvable');
    expect(notFoundRewriteFor('/fr/le-reseau/%20')).toBe('/fr/introuvable');
    expect(notFoundRewriteFor('/fr/le-reseau//x')).toBe('/fr/introuvable');
    expect(notFoundRewriteFor('/fr/le-reseau/%E0%A4%A')).toBe(
      '/fr/introuvable',
    );
    // An ordinary slug, even encoded, is still a detail page.
    expect(notFoundRewriteFor('/fr/le-reseau/%00a')).toBe('/fr/introuvable');
    expect(notFoundRewriteFor('/fr/le-reseau/caf%C3%A9')).toBeNull();
  });
});
