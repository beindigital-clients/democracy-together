// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';

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

describe('Annuaire — listDirectory (F-19)', () => {
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

    // no filter: active ones only, sorted by name (Alpha before Beta)
    const all = await t.query(api.organizations.listDirectory, {});
    expect(all.items.map((o) => o.slug)).toEqual(['alpha', 'beta']);
    expect(all.total).toBe(2);

    // facets (over the active set)
    const regions = Object.fromEntries(
      all.facets.regions.map((r) => [r.value, r.count]),
    );
    expect(regions['afrique-ouest']).toBe(1);
    expect(regions['europe-ouest']).toBe(1);
    expect(regions['afrique-est']).toBeUndefined(); // 'pending' excluded

    // region filter
    const eu = await t.query(api.organizations.listDirectory, {
      region: 'europe-ouest',
    });
    expect(eu.items.map((o) => o.slug)).toEqual(['beta']);

    // theme filter
    const gov = await t.query(api.organizations.listDirectory, {
      theme: 'gouvernance',
    });
    expect(gov.items.map((o) => o.slug)).toEqual(['alpha', 'beta']);
    const elec = await t.query(api.organizations.listDirectory, {
      theme: 'elections',
    });
    expect(elec.items.map((o) => o.slug)).toEqual(['alpha']);

    // full-text search (description)
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

describe('Adhésion — une seule candidature en attente par adresse (R-09)', () => {
  const candidature = {
    type: 'organisation' as const,
    organizationName: 'Institut Démo Sahel',
    contactEmail: 'contact@institut-demo.org',
    country: 'Sénégal',
  };

  it('refuse la seconde candidature pending, quelle que soit la casse de l’adresse', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.organizations.storeApplication, candidature);

    // `.data` and not the message: it is what travels through the public action
    // to the form, for a dedicated label.
    await expect(
      t.mutation(internal.organizations.storeApplication, {
        ...candidature,
        contactEmail: '  Contact@Institut-Demo.ORG ',
      }),
    ).rejects.toMatchObject({ data: 'DUPLICATE_APPLICATION' });

    expect(
      await t.run((ctx) => ctx.db.query('membershipApplications').collect()),
    ).toHaveLength(1);
  });

  it('accepte une nouvelle candidature une fois la précédente tranchée', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const premiere = await t.mutation(
      internal.organizations.storeApplication,
      candidature,
    );
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: premiere,
        decision: 'rejected',
      });

    // A rejected application is no longer "in progress": one can
    // apply again.
    await t.mutation(internal.organizations.storeApplication, candidature);
    expect(
      await t.run((ctx) => ctx.db.query('membershipApplications').collect()),
    ).toHaveLength(2);
  });

  it('deux adresses différentes ne se bloquent pas', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.organizations.storeApplication, candidature);
    await t.mutation(internal.organizations.storeApplication, {
      ...candidature,
      contactEmail: 'autre@institut-demo.org',
    });
    expect(
      await t.run((ctx) => ctx.db.query('membershipApplications').collect()),
    ).toHaveLength(2);
  });
});
