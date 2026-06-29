// @vitest-environment edge-runtime
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const DAY = 24 * 60 * 60 * 1000;

// Force le NO-OP de l'adaptateur e-mail pour tout le fichier : aucun e-mail
// réel n'est émis quel que soit l'environnement de test (déterminisme — cf.
// newsletter.test.ts). sendDueReminders appelle sendEmail, qui devient un log.
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

    const r1 = await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'conference-inaugurale',
      email: '  Awa@Example.org ',
      eventDate,
    });
    expect(r1.already).toBe(false);

    const all = await t.run((ctx) =>
      ctx.db.query('eventReminders').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].sent).toBe(false);
    expect(all[0].eventSlug).toBe('conference-inaugurale');

    // redemander le MÊME rappel = idempotent, pas de doublon
    const r2 = await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'conference-inaugurale',
      email: 'awa@example.org',
      eventDate,
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('eventReminders').collect())).length,
    ).toBe(1);

    // même adresse, AUTRE event = rappel distinct
    await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'webinaire-jeunes-releve',
      email: 'awa@example.org',
      eventDate,
    });
    expect(
      (await t.run((ctx) => ctx.db.query('eventReminders').collect())).length,
    ).toBe(2);

    // e-mail invalide rejeté
    await expect(
      t.mutation(internal.eventReminders.storeReminder, {
        eventSlug: 'conference-inaugurale',
        email: 'pas-un-email',
        eventDate,
      }),
    ).rejects.toThrow();
  });
});

describe('Rappels événements — sendDueReminders (F-55)', () => {
  it('marque sent=true un rappel proche ; ignore les rappels hors fenêtre et déjà envoyés', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    // (a) proche (dans 1 jour) -> doit être envoyé puis marqué sent=true
    await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'event-proche',
      email: 'soon@dt.test',
      eventDate: now + 1 * DAY,
    });
    // (b) hors fenêtre (dans 10 jours) -> ne doit PAS être envoyé
    await t.mutation(internal.eventReminders.storeReminder, {
      eventSlug: 'event-lointain',
      email: 'later@dt.test',
      eventDate: now + 10 * DAY,
    });
    // (c) déjà envoyé (proche mais sent=true) -> reste tel quel
    await t.run((ctx) =>
      ctx.db.insert('eventReminders', {
        eventSlug: 'event-deja-envoye',
        email: 'done@dt.test',
        eventDate: now + 1 * DAY,
        sent: true,
        createdAt: now,
      }),
    );

    // Déclenche l'action interne directement (on NE teste PAS le cron lui-même).
    const res = await t.action(internal.eventReminders.sendDueReminders, {});
    expect(res.processed).toBe(1);

    const byEmail = async (email: string) =>
      t.run((ctx) =>
        ctx.db
          .query('eventReminders')
          .filter((q) => q.eq(q.field('email'), email))
          .unique(),
      );

    // (a) proche -> envoyé
    expect((await byEmail('soon@dt.test'))?.sent).toBe(true);
    // (b) hors fenêtre -> toujours en attente
    expect((await byEmail('later@dt.test'))?.sent).toBe(false);
    // (c) déjà envoyé -> inchangé (toujours true)
    expect((await byEmail('done@dt.test'))?.sent).toBe(true);

    // un second passage ne retraite rien (plus aucun rappel dû non envoyé)
    const res2 = await t.action(internal.eventReminders.sendDueReminders, {});
    expect(res2.processed).toBe(0);
  });
});

// Garde anti-régression : le terme banni « démocratie libérale » / « liberal
// democracy » ne doit apparaître dans aucun contenu éditorial de la feature.
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
