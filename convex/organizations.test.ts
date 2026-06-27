// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const base = {
  status: 'active' as const,
  createdAt: 0,
  languages: ['fr'],
  description: '',
};

describe("Annuaire — listDirectory (F-19)", () => {
  it('liste les actifs, filtre, calcule les facettes et trie par nom', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('organizations', {
        ...base,
        name: 'Beta',
        slug: 'beta',
        country: 'FR',
        region: 'europe-ouest',
        themes: ['gouvernance'],
      });
      await ctx.db.insert('organizations', {
        ...base,
        name: 'Alpha',
        slug: 'alpha',
        country: 'SN',
        region: 'afrique-ouest',
        themes: ['gouvernance', 'elections'],
        description: 'Sahel',
      });
      await ctx.db.insert('organizations', {
        ...base,
        name: 'Caché',
        slug: 'cache',
        country: 'KE',
        region: 'afrique-est',
        themes: ['numerique'],
        status: 'pending',
      });
    });

    // sans filtre : actifs seulement, triés par nom (Alpha avant Beta)
    const all = await t.query(api.organizations.listDirectory, {});
    expect(all.items.map((o) => o.slug)).toEqual(['alpha', 'beta']);
    expect(all.total).toBe(2);

    // facettes (sur l'ensemble actif)
    const regions = Object.fromEntries(
      all.facets.regions.map((r) => [r.value, r.count]),
    );
    expect(regions['afrique-ouest']).toBe(1);
    expect(regions['europe-ouest']).toBe(1);
    expect(regions['afrique-est']).toBeUndefined(); // 'pending' exclu

    // filtre région
    const eu = await t.query(api.organizations.listDirectory, {
      region: 'europe-ouest',
    });
    expect(eu.items.map((o) => o.slug)).toEqual(['beta']);

    // filtre thématique
    const gov = await t.query(api.organizations.listDirectory, {
      theme: 'gouvernance',
    });
    expect(gov.items.map((o) => o.slug)).toEqual(['alpha', 'beta']);
    const elec = await t.query(api.organizations.listDirectory, {
      theme: 'elections',
    });
    expect(elec.items.map((o) => o.slug)).toEqual(['alpha']);

    // recherche plein texte (description)
    const search = await t.query(api.organizations.listDirectory, {
      q: 'sahel',
    });
    expect(search.items.map((o) => o.slug)).toEqual(['alpha']);
  });

  it('expose la fiche par slug (F-21)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('organizations', {
        ...base,
        name: 'Institut Test',
        slug: 'institut-test',
        country: 'SN',
        region: 'afrique-ouest',
        themes: ['gouvernance'],
      });
    });
    const found = await t.query(api.organizations.getBySlug, {
      slug: 'institut-test',
    });
    expect(found?.name).toBe('Institut Test');
    const missing = await t.query(api.organizations.getBySlug, {
      slug: 'inexistant',
    });
    expect(missing).toBeNull();
  });
});
