// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import { EMAIL_MAX_LENGTH, FIELD_MAX, isEmail } from './lib/validation';
import { insertTestEvent } from './lib/contenus/fixtures';

// PUBLIC FORM BOUNDS — pentest M-2 ("stuffing") and M-5.
//
// What the pentest noted: "no max length on contact,
// storeApplication […] up to ~1 MB per submission", and, for event
// reminders, a reloadable queue towards a third party's address.
//
// THIS FILE TESTS BOTH SIDES OF EACH BOUND. A test that only checked
// the refusal would still pass the day validation refused EVERYTHING —
// that is the symmetric failure, and it is silent for anyone who only looks at
// red. Each edge case is therefore played at the bound (accepted) and at the bound
// + 1 (refused).
//
// We target the `internalMutation`s rather than the gate actions: the reCAPTCHA
// gate has its own tests, and what is at stake here is validation.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const CORPS_VALIDE = 'Un message de longueur raisonnable pour ce formulaire.';

describe('contact — bornes hautes des champs libres (pentest M-2)', () => {
  const message = (surcharge: Partial<Record<string, string>> = {}) => ({
    name: 'Awa Diop',
    email: 'contact@exemple.test',
    subject: 'Partenariat',
    body: CORPS_VALIDE,
    ...surcharge,
  });

  it('accepte un corps À la borne et refuse la borne + 1', async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.contact.store,
      message({ body: 'x'.repeat(FIELD_MAX.body) }),
    );
    const apresAccepte = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(apresAccepte, 'la borne exacte doit passer').toHaveLength(1);

    await expect(
      t.mutation(
        internal.contact.store,
        message({
          email: 'autre@exemple.test',
          body: 'x'.repeat(FIELD_MAX.body + 1),
        }),
      ),
      'REMPLISSAGE : un corps au-delà de la borne est accepté',
    ).rejects.toThrow('INVALID_BODY');

    const apresRefus = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(apresRefus, 'rien de plus ne doit avoir été écrit').toHaveLength(1);
  });

  it('refuse un nom et un sujet au-delà de leur borne', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        internal.contact.store,
        message({ name: 'x'.repeat(FIELD_MAX.name + 1) }),
      ),
    ).rejects.toThrow('INVALID_NAME');

    await expect(
      t.mutation(
        internal.contact.store,
        message({ subject: 'x'.repeat(FIELD_MAX.subject + 1) }),
      ),
    ).rejects.toThrow('INVALID_SUBJECT');
  });

  it('refuse le corps de 1 Mo que le pentest décrivait', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(
        internal.contact.store,
        message({ body: 'A'.repeat(1_000_000) }),
      ),
    ).rejects.toThrow('INVALID_BODY');
    const stockes = await t.run((ctx) =>
      ctx.db.query('contactMessages').collect(),
    );
    expect(stockes).toHaveLength(0);
  });
});

describe('adhésion — bornes hautes des champs libres (pentest M-2)', () => {
  const candidature = (surcharge: Record<string, unknown> = {}) => ({
    type: 'organisation' as const,
    organizationName: 'Institut X',
    contactEmail: 'contact@institut-x.test',
    country: 'Sénégal',
    ...surcharge,
  });

  it('accepte un message À la borne et refuse la borne + 1', async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      internal.organizations.storeApplication,
      candidature({ message: 'x'.repeat(FIELD_MAX.body) }),
    );
    expect(
      await t.run((ctx) => ctx.db.query('membershipApplications').collect()),
    ).toHaveLength(1);

    await expect(
      t.mutation(
        internal.organizations.storeApplication,
        candidature({
          contactEmail: 'autre@institut-x.test',
          message: 'x'.repeat(FIELD_MAX.body + 1),
        }),
      ),
    ).rejects.toThrow('INVALID_MESSAGE');
  });

  it('refuse un nom d’organisation et un pays au-delà de leur borne', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        internal.organizations.storeApplication,
        candidature({ organizationName: 'x'.repeat(FIELD_MAX.name + 1) }),
      ),
    ).rejects.toThrow('INVALID_NAME');

    await expect(
      t.mutation(
        internal.organizations.storeApplication,
        candidature({ country: 'x'.repeat(FIELD_MAX.country + 1) }),
      ),
    ).rejects.toThrow('INVALID_COUNTRY');
  });
});

describe('adresse e-mail — borne RFC partagée par les sept formulaires', () => {
  // `isEmail` is the common chokepoint: the bound is set there once.
  const adresse = (longueurLocale: number) =>
    `${'a'.repeat(longueurLocale)}@exemple.test`;

  it('accepte 254 caractères et refuse 255', () => {
    const juste = adresse(EMAIL_MAX_LENGTH - '@exemple.test'.length);
    expect(juste).toHaveLength(EMAIL_MAX_LENGTH);
    expect(isEmail(juste), 'la borne exacte doit passer').toBe(true);

    const unDeTrop = adresse(EMAIL_MAX_LENGTH - '@exemple.test'.length + 1);
    expect(unDeTrop).toHaveLength(EMAIL_MAX_LENGTH + 1);
    expect(isEmail(unDeTrop), 'REMPLISSAGE : adresse non bornée').toBe(false);
  });

  it('la borne atteint bien un formulaire, pas seulement le helper', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.contact.store, {
        name: 'Awa Diop',
        email: adresse(EMAIL_MAX_LENGTH),
        subject: 'Partenariat',
        body: CORPS_VALIDE,
      }),
    ).rejects.toThrow('INVALID_EMAIL');
  });
});

describe('rappels d’événements — file non rechargeable (pentest M-5)', () => {
  const CIBLE = 'cible@exemple.test';
  const demain = () => Date.now() + 86_400_000;

  const demander = (
    t: ReturnType<typeof convexTest>,
    eventSlug: string,
    email = CIBLE,
    eventDate = demain(),
  ) =>
    t.mutation(internal.eventReminders.storeReminder, {
      eventSlug,
      email,
      eventDate,
    });

  it('plafonne les rappels EN ATTENTE d’une adresse, et ne se recharge pas avec le temps', async () => {
    const t = convexTest(schema, modules);
    // Since the "contenus" workstream, the slug is validated against the table:
    // varying the slug only yields a fresh slot if it designates a REAL
    // open event. The cap remains the subject of the test, so we create these
    // events (30 days out: the clock advanced below does not catch up with them).
    await t.run(async (ctx) => {
      for (const slug of [
        'evenement-0',
        'evenement-1',
        'evenement-2',
        'evenement-3',
        'evenement-4',
        'evenement-de-trop',
        'evenement-apres-envoi',
      ]) {
        await insertTestEvent(ctx, {
          slug,
          startsAt: Date.now() + 30 * 86_400_000,
        });
      }
    });

    // THE CLOCK IS ADVANCED BETWEEN EACH REQUEST, and that is the heart of the test.
    // The per-address HOURLY cap (5/h) would otherwise bite first — yet
    // it is precisely the one the pentest described as insufficient: it
    // replenishes, so five more the next hour, a hundred and twenty per day.
    // By neutralizing the hourly counter, we isolate the ABSOLUTE cap, the one
    // that counts unsent reminders.
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(Date.now() + 2 * 3_600_000);
        await demander(t, `evenement-${i}`);
      }

      vi.setSystemTime(Date.now() + 2 * 3_600_000);
      await expect(
        demander(t, 'evenement-de-trop'),
        'HARCÈLEMENT : la file d’une adresse tierce se recharge avec le temps',
      ).rejects.toThrow('TOO_MANY_PENDING_REMINDERS');

      // The slot frees up when a reminder goes out — it is a queue cap,
      // not a ban.
      await t.run(async (ctx) => {
        const premier = await ctx.db.query('eventReminders').first();
        if (premier) await ctx.db.patch(premier._id, { sent: true });
      });
      vi.setSystemTime(Date.now() + 2 * 3_600_000);
      await demander(t, 'evenement-apres-envoi');
    } finally {
      vi.useRealTimers();
    }

    const enAttente = await t.run((ctx) =>
      ctx.db
        .query('eventReminders')
        .withIndex('by_email_and_sent', (q) =>
          q.eq('email', CIBLE).eq('sent', false),
        )
        .collect(),
    );
    expect(enAttente).toHaveLength(5);
  });

  // The date is no longer supplied by the caller but read from the table: the
  // "neither past, nor more than a year ahead" bound has given way to refusing an
  // event that has started or is unknown (`EVENT_CLOSED`).
  it('la date fournie est ignorée : un événement passé est refusé, un événement ouvert accepté', async () => {
    const t = convexTest(schema, modules);
    const passe = Date.now() - 86_400_000;
    await t.run(async (ctx) => {
      await insertTestEvent(ctx, {
        slug: 'evenement-passe',
        startsAt: passe,
        endsAt: passe + 3_600_000,
      });
      await insertTestEvent(ctx, { slug: 'evenement-normal' });
    });

    await expect(
      demander(t, 'evenement-passe', CIBLE, Date.now() + 86_400_000),
    ).rejects.toMatchObject({ data: 'EVENT_CLOSED' });

    // Non-vacuity: an open event passes, whatever the supplied date.
    await demander(t, 'evenement-normal', CIBLE, Date.now() + 400 * 86_400_000);
    expect(
      await t.run((ctx) => ctx.db.query('eventReminders').collect()),
    ).toHaveLength(1);
  });
});
