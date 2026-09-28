// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { insertTestEvent } from './lib/contenus/fixtures';

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
    await t.run(async (ctx) => {
      await insertTestEvent(ctx, { slug: 'conference-inaugurale' });
      await insertTestEvent(ctx, { slug: 'webinaire-jeunes-releve' });
    });

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

    // re-registering for the SAME event = idempotent
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

    // same address, OTHER event = distinct registration
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'webinaire-jeunes-releve',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    expect(
      (await t.run((ctx) => ctx.db.query('eventRegistrations').collect()))
        .length,
    ).toBe(2);

    // invalid e-mail / name too short rejected
    await expect(
      t.mutation(internal.events.storeRegistration, {
        eventSlug: 'conference-inaugurale',
        name: 'Bob',
        email: 'pas-un-email',
      }),
    ).rejects.toThrow('INVALID_EMAIL');
    await expect(
      t.mutation(internal.events.storeRegistration, {
        eventSlug: 'conference-inaugurale',
        name: 'B',
        email: 'b@example.org',
      }),
    ).rejects.toThrow('INVALID_NAME');
  });
});

describe('Inscriptions événements — back-office (F-53)', () => {
  it('réserve la liste aux modérateurs et au-dessus', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      insertTestEvent(ctx, {
        slug: 'conference-inaugurale',
        title: { fr: 'Conférence inaugurale' },
      }),
    );
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'conference-inaugurale',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });

    // anonymous refused
    await expect(
      t.query(api.events.listEventRegistrations, {}),
    ).rejects.toThrow();

    // visitor refused
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .query(api.events.listEventRegistrations, {}),
    ).rejects.toThrow();

    // moderator: access to the list
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const list = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.events.listEventRegistrations, {});
    expect(list).toHaveLength(1);
    expect(list[0].eventSlug).toBe('conference-inaugurale');
    // The title comes from the table, no longer from a catalog coded on the screen side.
    expect(list[0].eventTitle).toBe('Conférence inaugurale');
    expect(list[0].email).toBe('awa@example.org');
  });
});

// A-03 (campaign of 27/09) then M-5 (pentest): registration for a PAST
// event was accepted and stored, and the slug was only checked against a
// copied list. It is now checked against the `contentEvents` table.
describe('Inscriptions événements — validées contre la table (A-03, M-5)', () => {
  it('refuse un événement inconnu, brouillon, annulé ou passé avec EVENT_CLOSED, sans rien stocker', async () => {
    const t = convexTest(schema, modules);
    const past = Date.now() - 10 * 86_400_000;
    await t.run(async (ctx) => {
      await insertTestEvent(ctx, { slug: 'brouillon', status: 'draft' });
      await insertTestEvent(ctx, { slug: 'annule', status: 'cancelled' });
      await insertTestEvent(ctx, {
        slug: 'passe',
        startsAt: past,
        endsAt: past + 3_600_000,
      });
    });
    for (const eventSlug of [
      'evenement-inexistant',
      'brouillon',
      'annule',
      'passe',
    ]) {
      await expect(
        t.mutation(internal.events.storeRegistration, {
          eventSlug,
          name: 'Awa Diop',
          email: 'awa@example.org',
        }),
      ).rejects.toMatchObject({ data: 'EVENT_CLOSED' });
    }
    expect(
      await t.run((ctx) => ctx.db.query('eventRegistrations').collect()),
    ).toHaveLength(0);
  });

  it('un événement EN COURS reste ouvert jusqu’à sa fin', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      insertTestEvent(ctx, {
        slug: 'en-cours',
        startsAt: Date.now() - 3_600_000,
        endsAt: Date.now() + 3_600_000,
      }),
    );
    const r = await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'en-cours',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    expect(r.ok).toBe(true);
  });

  it('refuse au-delà de la capacité (EVENT_FULL), sans refuser un inscrit qui renvoie le formulaire', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      insertTestEvent(ctx, { slug: 'petit-atelier', capacity: 1 }),
    );
    await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'petit-atelier',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    await expect(
      t.mutation(internal.events.storeRegistration, {
        eventSlug: 'petit-atelier',
        name: 'Bob Martin',
        email: 'bob@example.org',
      }),
    ).rejects.toMatchObject({ data: 'EVENT_FULL' });
    const again = await t.mutation(internal.events.storeRegistration, {
      eventSlug: 'petit-atelier',
      name: 'Awa Diop',
      email: 'awa@example.org',
    });
    expect(again.already).toBe(true);
  });
});
