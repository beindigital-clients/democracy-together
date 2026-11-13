import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isProtectedPath } from '@/lib/protected-routes';

// CERCLE DES AMIS — LEAK CONTROL (feature 4), the STATIC half.
//
// The run-time half (what each public query actually returns) is
// convex/cercle-leaks.test.ts. What cannot be shown by calling functions is
// the absence of a path: that no module outside the Cercle's own reads its
// tables, that translation, search and AI moderation never mention it, that no
// HTTP or Next route exposes it, that the sitemap never lists it. These tests
// read the sources, so that a future change which opens one of those paths
// fails here, in front of the person making it.

const ROOT = process.cwd();

function walk(dir: string, accept: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '_generated') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, accept));
    else if (accept(path)) out.push(path);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CONVEX_SOURCES = walk(
  join(ROOT, 'convex'),
  (p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p) && !p.endsWith('.d.ts'),
).map(rel);

// THE ONLY MODULES that may read or write a Cercle table. Each one is part of
// the Cercle itself, or is the account-deletion registry's adapter for it.
const MAY_TOUCH_CERCLE_TABLES = new Set([
  'convex/cercle.ts',
  'convex/cercleContributions.ts',
  'convex/lib/cercleUserData.ts',
  // The table definitions themselves.
  'convex/lib/tables/cercle.ts',
]);

// The Cercle's tables. A new Cercle table is added here, so that the guard
// below covers it from its first commit.
const CERCLE_TABLES = [
  'cercleContributions',
  'cercleRequests',
  'cercleUploads',
];
const NAMED = CERCLE_TABLES.join('|');
// A table is NAMED when it is queried or written, or typed (`Id<'…'>`,
// `Doc<'…'>`, `v.id('…')`). A mention in a comment or a rate-limit key is not.
const CERCLE_TABLE_LITERAL = new RegExp(
  `(?:query|insert|patch|replace|delete|normalizeId|id)\\(\\s*['"](?:${NAMED})['"]|<\\s*['"](?:${NAMED})['"]\\s*>`,
);

describe('Cercle leaks — who may read the Cercle’s tables', () => {
  it('finds the sources it is supposed to scan', () => {
    expect(CONVEX_SOURCES.length).toBeGreaterThan(100);
    expect(CONVEX_SOURCES).toContain('convex/cercle.ts');
  });

  it('no module outside the Cercle’s own names a Cercle table', () => {
    const offenders = CONVEX_SOURCES.filter(
      (file) =>
        !MAY_TOUCH_CERCLE_TABLES.has(file) &&
        CERCLE_TABLE_LITERAL.test(read(file)),
    );
    expect(
      offenders,
      `Ces modules lisent une table du Cercle sans y être autorisés : ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

// Surfaces that decide what is PUBLISHED, SEARCHED, TRANSLATED or SENT TO A
// THIRD PARTY. None of them has any business with the Cercle: not even a
// mention, so that "just this once" does not creep in.
const MUST_NEVER_MENTION_THE_CERCLE = [
  // Translation (third-party model, and a public reader of translated text).
  'convex/translation.ts',
  'convex/lib/translation.ts',
  'convex/documents.ts',
  // Search and its indexing.
  'convex/search.ts',
  'convex/searchIndexing.ts',
  'convex/lib/search.ts',
  'convex/lib/searchSources.ts',
  'convex/lib/searchText.ts',
  // AI moderation (third-party provider) and the gateway it calls.
  'convex/aiModeration.ts',
  'convex/lib/aiModeration.ts',
  'convex/communityModeration.ts',
  'convex/lib/aiGateway.ts',
  // Public lists.
  'convex/publications.ts',
  'convex/lib/publications.ts',
  'convex/kohopPublic.ts',
  'convex/tribune.ts',
  'convex/organizations.ts',
  'convex/experts.ts',
];

describe('Cercle leaks — publication, search, translation, AI moderation', () => {
  for (const file of MUST_NEVER_MENTION_THE_CERCLE) {
    it(`${file} does not mention the Cercle`, () => {
      expect(existsSync(join(ROOT, file)), `${file} existe`).toBe(true);
      expect(read(file)).not.toMatch(/cercle/i);
    });
  }

  it('every public content module under convex/contenus ignores the Cercle', () => {
    const files = CONVEX_SOURCES.filter((f) =>
      f.startsWith('convex/contenus/'),
    );
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      expect(read(file), file).not.toMatch(/cercle/i);
    }
  });

  it('the Cercle’s own modules never call the AI gateway or schedule a review', () => {
    for (const file of [
      'convex/cercleContributions.ts',
      'convex/cercleHttp.ts',
    ]) {
      const source = read(file);
      // No import of, and no call into, the moderation or gateway modules
      // (a comment may say why: only code is judged).
      expect(source, file).not.toMatch(
        /from\s+['"][^'"]*(aiModeration|aiGateway|communityModeration)/,
      );
      expect(source, file).not.toMatch(
        /internal\.(aiModeration|communityModeration)/,
      );
      expect(source, file).not.toMatch(/ctx\.scheduler\./);
      expect(source, file).not.toMatch(/\bfetch\(/);
    }
  });
});

describe('Cercle leaks — HTTP and Next routes', () => {
  it('the only Convex HTTP route about the Cercle is the anonymous CV upload (POST + CORS preflight)', () => {
    const http = read('convex/http.ts');
    const routes = [
      ...http.matchAll(
        /path:\s*['"`]([^'"`]*)['"`],\s*method:\s*['"`]([A-Z]+)['"`]/g,
      ),
    ].map((m) => `${m[2]} ${m[1]}`);
    const cercle = routes.filter((r) => /cercle/i.test(r)).sort();
    expect(cercle).toEqual(['OPTIONS /cercle/cv', 'POST /cercle/cv']);
    // No route answers a GET with anything of the Cercle.
    expect(routes.filter((r) => /^GET .*cercle/i.test(r))).toEqual([]);
  });

  it('the upload endpoint answers with an id only, never a stored text', () => {
    const source = read('convex/cercleHttp.ts');
    expect(source).toMatch(/reply\(200, \{ storageId \}\)/);
    expect(source).not.toMatch(/db\.query/);
  });

  it('no Next route handler (route.ts) touches the Cercle', () => {
    const handlers = walk(join(ROOT, 'src'), (p) => /\/route\.tsx?$/.test(p));
    expect(handlers.length).toBeGreaterThan(0);
    for (const file of handlers) {
      expect(readFileSync(file, 'utf8'), rel(file)).not.toMatch(/cercle/i);
    }
  });

  it('no server-side fetch of the Cercle exists in the app (fetchQuery / preloadQuery)', () => {
    const sources = walk(join(ROOT, 'src'), (p) => /\.tsx?$/.test(p));
    const offenders = sources.filter((file) =>
      /(fetchQuery|preloadQuery|fetchAction|fetchMutation)\(\s*api\.cercle/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe('Cercle leaks — sitemap, robots, routing', () => {
  it('the sitemap lists the public presentation page and nothing private', () => {
    const sitemap = read('src/app/sitemap.ts');
    expect(sitemap).toContain("'cercle'");
    // No path of the member area among the listed addresses.
    expect(sitemap).not.toMatch(/['"`]espace-membre/);
    // …and never queries the Cercle.
    expect(sitemap).not.toMatch(/api\.cercle/);
  });

  it('robots.txt disallows the member area, where the private space lives', () => {
    const robots = read('src/app/robots.ts');
    expect(robots).toMatch(/PRIVATE = \[[^\]]*'espace-membre'/);
    expect(robots).toMatch(/PRIVATE = \[[^\]]*'admin'/);
  });

  it('the private space is behind sign-in; the public page is not', () => {
    expect(isProtectedPath('/fr/espace-membre/cercle')).toBe(true);
    expect(isProtectedPath('/en/espace-membre/cercle')).toBe(true);
    expect(isProtectedPath('/fr/admin/cercle')).toBe(true);
    expect(isProtectedPath('/fr/cercle')).toBe(false);
  });

  it('the private page does not render on the server (nothing to prerender or index)', () => {
    const page = read('src/app/[locale]/espace-membre/cercle/page.tsx');
    expect(page.startsWith("'use client'")).toBe(true);
    expect(page).not.toMatch(/generateStaticParams|generateMetadata/);
  });

  it('the public page shows the form and the explanation, and queries nothing', () => {
    const page = read('src/app/[locale]/cercle/page.tsx');
    expect(page).not.toMatch(/api\.cercle|fetchQuery|useQuery/);
  });
});
