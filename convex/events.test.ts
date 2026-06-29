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

describe('Inscriptions événements — register (F-53)', () => {
  it('inscrit (normalise), dédupe par event+email, rejette invalides', async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'conference-inaugurale',
      name: '  Awa Diop ',
      email: '  Awa@Example.org ',
      organization: '  Institut X  ',
    });
    expect(r1.already).toBe(false);

    const all = await t.run((ctx) =>
      ctx.db.query('eventRegistrations').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].name).toBe('Awa Diop');
    expect(all[0].organization).toBe('Institut X');

    // ré-inscription au MÊME event = idempotente
    const r2 = await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'conference-inaugurale',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('eventRegistrations').collect()))
        .length,
    ).toBe(1);

    // même adresse, AUTRE event = inscription distincte
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'webinaire-jeunes-releve',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    expect(
      (await t.run((ctx) => ctx.db.query('eventRegistrations').collect()))
        .length,
    ).toBe(2);

    // e-mail invalide / nom trop court rejetés
    await expect(
      t.mutation(internal.events.storeRegistration, {
        eventSlug: 'x',
        name: 'Bob',
        email: 'pas-un-email',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.events.storeRegistration, {
        eventSlug: 'x',
        name: 'B',
        email: 'b@example.org',
      }),
    ).rejects.toThrow();
  });
});

describe('Inscriptions événements — back-office (F-53)', () => {
  it('réserve la liste aux modérateurs et au-dessus', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'conference-inaugurale',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });

    // anonyme refusé
    await expect(
      t.query(api.events.listEventRegistrations, {}),
    ).rejects.toThrow();

    // visiteur refusé
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .query(api.events.listEventRegistrations, {}),
    ).rejects.toThrow();

    // modérateur : accès à la liste
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const list = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.events.listEventRegistrations, {});
    expect(list).toHaveLength(1);
    expect(list[0].eventSlug).toBe('conference-inaugurale');
    expect(list[0].email).toBe('awa@example.org');
  });
});
