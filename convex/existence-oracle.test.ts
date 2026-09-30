// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
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

// F-09 / pentest M-8 — public forms no longer say whether an address
// is already known.
//
// WHAT IS TESTED HERE IS NOT "the flag is gone". It is the property that
// matters to an attacker: the two responses must be
// INDISTINGUISHABLE. A test checking that `already` is absent would still
// pass the day someone reintroduced the distinction under another name
// — `status: 'existing'`, an error code, an extra field. The comparison
// is therefore on the ENTIRE, serialized response.
//
// These five actions are open and unauthenticated. The per-IP and
// per-form caps slow down mass enumeration; they cost nothing to
// a targeted check — "is this person registered with you?" —
// which only takes a single call.

// A newsletter sign-up schedules its confirmation with `runAfter(0)`.
// Left alone, it runs once the test lets go of the event loop, after the
// test has ended, and a log landing during the file's teardown fails the
// whole Vitest run (see convex/newsletter.test.ts). Each instance is
// drained before its test ends, before the environment is unstubbed.
const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
async function drainScheduled() {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(async () => {
  await drainScheduled();
  vi.unstubAllEnvs();
});

/** Bypasses reCAPTCHA, as development, CI and the E2E already do. */
function harnais() {
  vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
  vi.stubEnv('RECAPTCHA_DISABLED', 'true');
  // SIMULATED sending mode, like the development deployment and CI:
  // since the double opt-in (diffusion workstream), the newsletter sign-up
  // refuses — equally for every address — when no confirmation e-mail
  // can go out. Without a provider, the property tested here
  // would not be reached.
  vi.stubEnv('AUTH_DEV_OTP', 'true');
  return newConvexTest();
}

// Registrations and reminders are validated against the events table
// ("contenus" workstream): the oracle is tested on OPEN events.
async function ouvrirEvenements(t: ReturnType<typeof harnais>) {
  await t.run(async (ctx) => {
    await insertTestEvent(ctx, { slug: 'conference-inaugurale' });
    await insertTestEvent(ctx, { slug: 'sommet-2026' });
  });
}

const EMAIL = 'awa@example.org';

const CAS = [
  {
    nom: 'newsletter.subscribe',
    table: 'newsletterSubscriptions',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.newsletter.subscribe, { email: EMAIL, captchaToken: '' }),
  },
  {
    nom: 'events.registerForEvent',
    table: 'eventRegistrations',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.events.registerForEvent, {
        // A catalog slug: since A-03, an unknown or past event
        // is refused BEFORE any read — the oracle is tested on an open one.
        eventSlug: 'conference-inaugurale',
        name: 'Awa Diop',
        email: EMAIL,
        captchaToken: '',
      }),
  },
  {
    nom: 'mentorship.requestMentorship',
    table: 'mentorshipRequests',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.mentorship.requestMentorship, {
        name: 'Awa Diop',
        email: EMAIL,
        country: 'SN',
        role: 'mentore' as const,
        message: 'Je souhaite être accompagnée sur la gouvernance des données.',
        captchaToken: '',
      }),
  },
  {
    nom: 'youth.applyYouth',
    table: 'youthApplications',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.youth.applyYouth, {
        name: 'Awa Diop',
        email: EMAIL,
        country: 'SN',
        motivation: 'Participer aux travaux du hub jeunes du réseau.',
        captchaToken: '',
      }),
  },
  {
    nom: 'eventReminders.requestReminder',
    table: 'eventReminders',
    appel: (t: ReturnType<typeof harnais>) =>
      t.action(api.eventReminders.requestReminder, {
        eventSlug: 'sommet-2026',
        email: EMAIL,
        eventDate: Date.now() + 86_400_000,
        captchaToken: '',
      }),
  },
] as const;

describe('F-09 — aucun formulaire public ne révèle qu’une adresse est connue', () => {
  for (const { nom, table, appel } of CAS) {
    it(`${nom} : deux envois, deux réponses indiscernables`, async () => {
      const t = harnais();
      await ouvrirEvenements(t);

      const premier = await appel(t);
      const second = await appel(t);

      // The comparison is on the ENTIRE response: that is what shuts the
      // door on a distinction reintroduced under another name.
      expect(JSON.stringify(second)).toBe(JSON.stringify(premier));
      expect(premier).toEqual({ ok: true });
    });

    it(`${nom} : la déduplication continue de fonctionner`, async () => {
      const t = harnais();
      await ouvrirEvenements(t);
      await appel(t);
      await appel(t);
      // Silence in the response must not come at the cost of a duplicate in the
      // database: the internal mutation still distinguishes the two cases.
      const lignes = await t.run((ctx) => ctx.db.query(table).collect());
      expect(lignes).toHaveLength(1);
    });
  }
});
