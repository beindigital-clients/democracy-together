// @vitest-environment edge-runtime
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
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

const DAY = 24 * 60 * 60 * 1000;

// Forces the e-mail adapter NO-OP for the whole file: no real e-mail
// is sent whatever the test environment (determinism — cf.
// newsletter.test.ts). sendDueReminders calls sendEmail, which becomes a log.
let prevProvider: string | undefined;
beforeAll(() => {
  prevProvider = process.env.AUTH_EMAIL_PROVIDER;
  process.env.AUTH_EMAIL_PROVIDER = 'none';
});
afterAll(() => {
  if (prevProvider === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
  else process.env.AUTH_EMAIL_PROVIDER = prevProvider;
});

describe('Rappels événements — requestReminder (F-55)', () => {
  it('stocke (normalise), dédoublonne par event+email, rejette invalides', async () => {
    const t = convexTest(schema, modules);
    const eventDate = Date.now() + 5 * DAY;
    await t.run(async (ctx) => {
      await insertTestEvent(ctx, {
        slug: 'conference-inaugurale',
        startsAt: eventDate,
      });
      await insertTestEvent(ctx, { slug: 'webinaire-jeunes-releve' });
    });

    const r1 = await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'conference-inaugurale',
      email: '  Awa@Example.org ',
      eventDate,
    });
    expect(r1.already).toBe(false);

    const all = await t.run((ctx) => ctx.db.query('eventReminders').collect());
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].sent).toBe(false);
    expect(all[0].eventSlug).toBe('conference-inaugurale');
    // The reminder date is the EVENT's, read from the table.
    expect(all[0].eventDate).toBe(eventDate);

    // requesting the SAME reminder again = idempotent, no duplicate
    const r2 = await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'conference-inaugurale',
      email: 'awa@example.org',
      eventDate,
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('eventReminders').collect())).length,
    ).toBe(1);

    // same address, OTHER event = distinct reminder
    await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'webinaire-jeunes-releve',
      email: 'awa@example.org',
      eventDate,
    });
    expect(
      (await t.run((ctx) => ctx.db.query('eventReminders').collect())).length,
    ).toBe(2);

    // invalid e-mail rejected
    await expect(
      t.mutation(internal.eventReminders.storeReminder, {
        eventSlug: 'conference-inaugurale',
        email: 'pas-un-email',
        eventDate,
      }),
    ).rejects.toThrow();
  });
});

describe('Rappels événements — validés contre la table (pentest M-5)', () => {
  it('refuse un événement inconnu, brouillon, annulé ou commencé ; ignore la date fournie', async () => {
    const t = convexTest(schema, modules);
    const past = Date.now() - 2 * DAY;
    await t.run(async (ctx) => {
      await insertTestEvent(ctx, { slug: 'brouillon', status: 'draft' });
      await insertTestEvent(ctx, { slug: 'annule', status: 'cancelled' });
      await insertTestEvent(ctx, {
        slug: 'passe',
        startsAt: past,
        endsAt: past + 3_600_000,
      });
      await insertTestEvent(ctx, {
        slug: 'commence',
        startsAt: Date.now() - 3_600_000,
        endsAt: Date.now() + 3_600_000,
      });
    });
    for (const eventSlug of [
      'inconnu',
      'brouillon',
      'annule',
      'passe',
      'commence',
    ]) {
      await expect(
        t.mutation(internal.eventReminders.storeReminder, {
          eventSlug,
          email: 'awa@example.org',
          eventDate: Date.now() + DAY,
        }),
      ).rejects.toMatchObject({ data: 'EVENT_CLOSED' });
    }
    // The date supplied by the caller is IGNORED: one can no longer schedule
    // a send at a time of one's choosing.
    const startsAt = Date.now() + 7 * DAY;
    await t.run((ctx) => insertTestEvent(ctx, { slug: 'ouvert', startsAt }));
    await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'ouvert',
      email: 'awa@example.org',
      eventDate: Date.now() + DAY,
    });
    const row = await t.run((ctx) => ctx.db.query('eventReminders').first());
    expect(row?.eventDate).toBe(startsAt);
  });
});

describe('Rappels événements — sendDueReminders (F-55)', () => {
  it('marque sent=true un rappel proche ; ignore les rappels hors fenêtre et déjà envoyés', async () => {
    // Explicit dev mode: since the H3 fix, the e-mail adapter only agrees
    // to simulate a success without a provider if AUTH_DEV_OTP=true.
    const prevDev = process.env.AUTH_DEV_OTP;
    process.env.AUTH_DEV_OTP = 'true';
    try {
      const t = convexTest(schema, modules);
      const now = Date.now();
      await t.run(async (ctx) => {
        await insertTestEvent(ctx, {
          slug: 'event-proche',
          startsAt: now + DAY,
        });
        await insertTestEvent(ctx, {
          slug: 'event-lointain',
          startsAt: now + 10 * DAY,
        });
        await insertTestEvent(ctx, {
          slug: 'event-deja-envoye',
          startsAt: now + DAY,
        });
      });

      // (a) near (in 1 day) -> must be sent then marked sent=true
      await t.mutation(internal.eventReminders.storeReminder, {
        eventSlug: 'event-proche',
        email: 'soon@dt.test',
        eventDate: now + 1 * DAY,
      });
      // (b) outside the window (in 10 days) -> must NOT be sent
      await t.mutation(internal.eventReminders.storeReminder, {
        eventSlug: 'event-lointain',
        email: 'later@dt.test',
        eventDate: now + 10 * DAY,
      });
      // (c) already sent (near but sent=true) -> stays as is
      await t.run((ctx) =>
        ctx.db.insert('eventReminders', {
          eventSlug: 'event-deja-envoye',
          email: 'done@dt.test',
          eventDate: now + 1 * DAY,
          sent: true,
          createdAt: now,
        }),
      );

      // Triggers the internal action directly (we do NOT test the cron itself).
      const res = await t.action(internal.eventReminders.sendDueReminders, {});
      expect(res.processed).toBe(1);

      const byEmail = async (email: string) =>
        t.run((ctx) =>
          ctx.db
            .query('eventReminders')
            .filter((q) => q.eq(q.field('email'), email))
            .unique(),
        );

      // (a) near -> sent
      expect((await byEmail('soon@dt.test'))?.sent).toBe(true);
      // (b) outside the window -> still pending
      expect((await byEmail('later@dt.test'))?.sent).toBe(false);
      // (c) already sent -> unchanged (still true)
      expect((await byEmail('done@dt.test'))?.sent).toBe(true);

      // a second pass reprocesses nothing (no due, unsent reminder left)
      const res2 = await t.action(internal.eventReminders.sendDueReminders, {});
      expect(res2.processed).toBe(0);
    } finally {
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
    }
  });

  // Anti-regression guard for audit H3: without an e-mail provider, a reminder
  // must NOT be marked sent=true — otherwise it is lost for good, as the cron
  // never picks it up again. It stays pending for the next pass.
  it('sans fournisseur (production) : ne marque PAS sent, le rappel reste à retenter', async () => {
    const prevDev = process.env.AUTH_DEV_OTP;
    const prevProv = process.env.AUTH_EMAIL_PROVIDER;
    delete process.env.AUTH_DEV_OTP;
    delete process.env.AUTH_EMAIL_PROVIDER;
    try {
      const t = convexTest(schema, modules);
      const now = Date.now();
      await t.run((ctx) =>
        insertTestEvent(ctx, { slug: 'event-proche', startsAt: now + DAY }),
      );
      await t.mutation(internal.eventReminders.storeReminder, {
        eventSlug: 'event-proche',
        email: 'soon@dt.test',
        eventDate: now + 1 * DAY,
      });

      const res = await t.action(internal.eventReminders.sendDueReminders, {});
      expect(res.processed).toBe(1); // the reminder was indeed examined…

      const row = await t.run((ctx) =>
        ctx.db
          .query('eventReminders')
          .filter((q) => q.eq(q.field('email'), 'soon@dt.test'))
          .unique(),
      );
      expect(row?.sent).toBe(false); // …mais PAS marqué envoyé
    } finally {
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
      if (prevProv === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
      else process.env.AUTH_EMAIL_PROVIDER = prevProv;
    }
  });
});

// Anti-regression guard: the banned term "démocratie libérale" / "liberal
// democracy" must not appear in any editorial content of the feature.
describe('Rappels événements — conformité éditoriale', () => {
  it("n'emploie jamais le terme banni (FR + EN)", async () => {
    const fr = (await import('../src/messages/fr.json')).default as Record<
      string,
      unknown
    >;
    const en = (await import('../src/messages/en.json')).default as Record<
      string,
      unknown
    >;
    const reminderFr = JSON.stringify(fr.reminder).toLowerCase();
    const reminderEn = JSON.stringify(en.reminder).toLowerCase();
    expect(reminderFr).not.toContain('démocratie libérale');
    expect(reminderFr).not.toContain('democratie liberale');
    expect(reminderEn).not.toContain('liberal democracy');
  });
});
