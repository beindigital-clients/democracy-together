// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import { httpRouter } from 'convex/server';
import schema from './schema';
import { api, internal } from './_generated/api';
import {
  CERCLE_CONFIRM_MAX_SENDS,
  IMPORT_MAX_ROWS,
  needsConfirmationSend,
  parseContactsCsv,
  senderIdentity,
} from './lib/cercleMailing';
import { unsubscribeOneClick, unsubscribeRedirect } from './cercleHttp';

// CERCLE DES AMIS — MAILING LIST (feature 5).
//
// Addresses are Resend's test addresses (`delivered+label@resend.dev`): a real
// run would never reach a person. The provider itself is a substitute `fetch`
// that records every request, which is what lets us assert who got what.

const router = httpRouter();
router.route({
  path: '/cercle/unsubscribe',
  method: 'POST',
  handler: unsubscribeOneClick,
});
router.route({
  path: '/cercle/unsubscribe',
  method: 'GET',
  handler: unsubscribeRedirect,
});

const modules = {
  ...import.meta.glob([
    './**/*.ts',
    './**/*.js',
    '!./**/*.test.ts',
    '!./**/*.d.ts',
    '!./auth.ts',
    '!./auth.config.ts',
    '!./http.ts',
  ]),
  './http.ts': async () => ({ default: router }),
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type T = TestConvex<typeof schema>;
type Email = {
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
};
type Call = { key: string | null; emails: Email[] };

function fakeResend(plan: Array<'ok' | 'down' | number> = [], identity = true) {
  const calls: Call[] = [];
  vi.stubEnv('AUTH_RESEND_KEY', 're_test');
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
  vi.stubEnv('SITE_URL', 'https://dt.test');
  vi.stubEnv('CONVEX_SITE_URL', 'https://api.dt.test');
  vi.stubEnv('NEWSLETTER_BATCH_SIZE', '2');
  if (identity) {
    vi.stubEnv('CERCLE_SENDER_NAME', 'Association Fictive');
    vi.stubEnv('CERCLE_SENDER_ADDRESS', '1 rue Imaginaire, 75000 Ville');
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (
        _url: string,
        init: { body: string; headers: Record<string, string> },
      ) => {
        const step = plan.shift() ?? 'ok';
        const body = JSON.parse(init.body) as Email | Email[];
        const emails = Array.isArray(body) ? body : [body];
        calls.push({ key: init.headers['Idempotency-Key'] ?? null, emails });
        if (step === 'down') throw new TypeError('fetch failed');
        if (typeof step === 'number')
          return new Response('{"message":"refus"}', { status: step });
        return new Response(
          JSON.stringify({ data: emails.map((_, i) => ({ id: `id${i}` })) }),
          {
            status: 200,
          },
        );
      },
    ),
  );
  return calls;
}

const addr = (label: string) => `delivered+${label}@resend.dev`;

// A 32-hex-character token derived from an address, like the real ones.
const hex = (s: string) =>
  [...s]
    .map((c) => c.charCodeAt(0).toString(16))
    .join('')
    .slice(0, 32)
    .padEnd(32, '0');

async function admin(t: T) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'president@example.test', role: 'admin' }),
  );
  return t.withIdentity({ subject: `${id}|s` });
}

async function importAddresses(t: T, labels: string[], batch = 'liste-test') {
  const as = await admin(t);
  return await as.mutation(api.cercleMailing.importContacts, {
    csv: ['email', ...labels.map(addr)].join('\n'),
    batch,
  });
}

const contacts = (t: T) =>
  t.run((ctx) => ctx.db.query('cercleContacts').collect());
const sentTo = (calls: Call[]) =>
  calls.flatMap((c) => c.emails.flatMap((e) => e.to));

function tokenIn(
  html: string,
  page: 'confirmation' | 'desinscription',
): string {
  const m = new RegExp(`/cercle/${page}\\?token=([0-9a-f]+)`).exec(html);
  if (!m) throw new Error(`no ${page} link in the message`);
  return m[1];
}

describe('Cercle mailing — reading a contact file', () => {
  it('reads a plain list, normalises, drops duplicates and invalid lines', () => {
    const parsed = parseContactsCsv(
      '﻿ Alice@Example.org \nbob@example.org\n\nnot-an-email\nALICE@example.org\n,\n',
    );
    expect(parsed.contacts.map((c) => c.email)).toEqual([
      'alice@example.org',
      'bob@example.org',
    ]);
    expect(parsed.duplicatesInFile).toBe(1);
    expect(parsed.invalid.map((i) => i.reason).sort()).toEqual([
      'EMPTY',
      'INVALID_EMAIL',
    ]);
  });

  it('reads a table with a header, any separator, quoted cells and a language column', () => {
    const parsed = parseContactsCsv(
      'Nom;Courriel;Langue\n"Dupont; Jean";jean@example.org;EN\nMarie;marie@example.org;xx\n',
    );
    expect(parsed.contacts).toEqual([
      { email: 'jean@example.org', locale: 'en', line: 2 },
      { email: 'marie@example.org', line: 3 },
    ]);
  });

  it('a first line that is an address is not mistaken for a header', () => {
    expect(
      parseContactsCsv('alice@example.org\nbob@example.org').contacts,
    ).toHaveLength(2);
  });

  it('stops at the row limit and says how many it left', () => {
    const lines = Array.from(
      { length: IMPORT_MAX_ROWS + 7 },
      (_, i) => `u${i}@example.org`,
    );
    const parsed = parseContactsCsv(lines.join('\n'));
    expect(parsed.contacts).toHaveLength(IMPORT_MAX_ROWS);
    expect(parsed.truncated).toBe(7);
  });
});

describe('Cercle mailing — sender identity and who still has to be asked', () => {
  it('is a marked placeholder until BOTH values are set', () => {
    expect(senderIdentity().placeholder).toBe(true);
    expect(senderIdentity().name).toContain('À CONFIRMER');
    vi.stubEnv('CERCLE_SENDER_NAME', 'Association Fictive');
    expect(senderIdentity().placeholder).toBe(true);
    vi.stubEnv('CERCLE_SENDER_ADDRESS', '1 rue Imaginaire');
    expect(senderIdentity()).toMatchObject({
      placeholder: false,
      name: 'Association Fictive',
    });
  });

  it('asks a pending contact once, retries a failed send within the bound, never nags', () => {
    expect(
      needsConfirmationSend({
        status: 'pending',
        confirmSends: 0,
        toAsk: true,
      }),
    ).toBe(true);
    // Sent and unanswered (`toAsk` cleared by the wave): not asked again.
    expect(
      needsConfirmationSend({
        status: 'pending',
        confirmSends: 1,
        toAsk: false,
      }),
    ).toBe(false);
    expect(needsConfirmationSend({ status: 'pending', confirmSends: 1 })).toBe(
      false,
    );
    // Failed to send: asked again, up to the bound.
    expect(
      needsConfirmationSend({
        status: 'pending',
        confirmSends: 1,
        toAsk: true,
      }),
    ).toBe(true);
    expect(
      needsConfirmationSend({
        status: 'pending',
        confirmSends: CERCLE_CONFIRM_MAX_SENDS,
        toAsk: true,
      }),
    ).toBe(false);
    expect(
      needsConfirmationSend({
        status: 'confirmed',
        confirmSends: 0,
        toAsk: true,
      }),
    ).toBe(false);
    expect(
      needsConfirmationSend({
        status: 'unsubscribed',
        confirmSends: 0,
        toAsk: true,
      }),
    ).toBe(false);
  });
});

describe('Cercle mailing — import', () => {
  it('only an administrator imports; contacts arrive pending, with their provenance, and nothing is sent', async () => {
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'ed@example.test', role: 'editeur' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${editor}|s` })
        .mutation(api.cercleMailing.importContacts, {
          csv: addr('a'),
          batch: 'x',
        }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.cercleMailing.importContacts, {
        csv: addr('a'),
        batch: 'x',
      }),
    ).rejects.toThrow();

    const report = await importAddresses(t, ['a', 'b', 'c']);
    expect(report).toMatchObject({ added: 3, alreadyOnList: 0, suppressed: 0 });
    const rows = await contacts(t);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toMatchObject({
        status: 'pending',
        source: 'import',
        importBatch: 'liste-test',
        confirmSends: 0,
      });
      expect(r.unsubToken).toMatch(/^[0-9a-f]{32}$/);
      expect(r.consent).toBeUndefined();
    }
    // Importing is not sending.
    expect(calls).toHaveLength(0);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(
      audit.filter((a) => a.action === 'cercle.contacts_imported'),
    ).toHaveLength(1);
  });

  it('a second import skips who is already listed, and never re-adds who unsubscribed', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a', 'b']);
    const a = (await contacts(t)).find((c) => c.email === addr('a'))!;
    await t.mutation(api.cercleMailing.unsubscribe, { token: a.unsubToken });

    const report = await importAddresses(t, ['a', 'b', 'c']);
    expect(report).toMatchObject({ added: 1, alreadyOnList: 1, suppressed: 1 });
    expect((await contacts(t)).find((c) => c.email === addr('a'))?.status).toBe(
      'unsubscribed',
    );
  });

  it('counts, without writing, reserved test domains and bad lines', async () => {
    const t = convexTest(schema, modules);
    const as = await admin(t);
    const report = await as.mutation(api.cercleMailing.importContacts, {
      csv: `email\nperson@example.org\n${addr('ok')}\nnope\n${addr('ok')}`,
      batch: 'mixte',
    });
    expect(report).toMatchObject({
      added: 1,
      unmailable: 1,
      duplicatesInFile: 1,
    });
    expect(report.invalid).toHaveLength(1);
    expect(await contacts(t)).toHaveLength(1);
  });

  it('refuses an empty file and a missing label', async () => {
    const t = convexTest(schema, modules);
    const as = await admin(t);
    await expect(
      as.mutation(api.cercleMailing.importContacts, {
        csv: '  \n',
        batch: 'x',
      }),
    ).rejects.toThrow(/EMPTY_FILE/);
    await expect(
      as.mutation(api.cercleMailing.importContacts, {
        csv: addr('a'),
        batch: '  ',
      }),
    ).rejects.toThrow(/INVALID_BATCH/);
  });
});

describe('Cercle mailing — the one confirmation message', () => {
  it('goes out in waves, once per contact, with the sender, a confirm link and an unsubscribe link', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a', 'b', 'c']);
    const as = await admin(t);

    expect(await as.mutation(api.cercleMailing.sendConfirmations, {})).toEqual({
      queued: 1,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Waves of 2 (NEWSLETTER_BATCH_SIZE): 3 contacts → 2 calls.
    expect(calls.map((c) => c.emails.length)).toEqual([2, 1]);
    expect(sentTo(calls).sort()).toEqual([addr('a'), addr('b'), addr('c')]);
    for (const email of calls.flatMap((c) => c.emails)) {
      expect(email.html).toContain('Association Fictive');
      expect(email.html).toContain('1 rue Imaginaire, 75000 Ville');
      expect(email.html).toContain(
        'https://dt.test/fr/cercle/confirmation?token=',
      );
      expect(email.html).toContain(
        'https://dt.test/fr/cercle/desinscription?token=',
      );
    }
    for (const c of await contacts(t)) {
      expect(c).toMatchObject({ status: 'pending', confirmSends: 1 });
      expect(c.confirmTokenHash).toMatch(/^[0-9a-f]{64}$/);
      // 30 days, from now.
      expect(c.confirmExpiresAt).toBeGreaterThan(
        Date.now() + 29 * 24 * 3600 * 1000,
      );
    }

    // No reminder: running it again sends nothing to people who did not answer.
    calls.length = 0;
    expect(await as.mutation(api.cercleMailing.sendConfirmations, {})).toEqual({
      queued: 0,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toHaveLength(0);
  });

  it('is refused while the sender identity is still a placeholder, and while there is no provider', async () => {
    fakeResend([], false);
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a']);
    const as = await admin(t);
    await expect(
      as.mutation(api.cercleMailing.sendConfirmations, {}),
    ).rejects.toThrow(/SENDER_IDENTITY_MISSING/);

    vi.unstubAllEnvs();
    await expect(
      as.mutation(api.cercleMailing.sendConfirmations, {}),
    ).rejects.toThrow(/EMAIL_PROVIDER_NOT_CONFIGURED/);
  });

  it('a simulated development send is allowed even with the placeholder', async () => {
    vi.useFakeTimers();
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a']);
    const as = await admin(t);
    expect(await as.mutation(api.cercleMailing.sendConfirmations, {})).toEqual({
      queued: 1,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await contacts(t))[0].confirmSends).toBe(1);
  });

  it('a provider outage is retried within the bound, with no one skipped and no one served twice', async () => {
    vi.useFakeTimers();
    const calls = fakeResend(['down', 'ok']);
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a', 'b']);
    const as = await admin(t);
    await as.mutation(api.cercleMailing.sendConfirmations, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Same two recipients tried twice: the first call never reached the provider.
    expect(calls).toHaveLength(2);
    for (const c of await contacts(t)) {
      expect(c.confirmSends).toBe(2);
      expect(c.confirmError).toBeUndefined();
    }
  });

  it('keeps retrying a permanent failure only up to the bound, and records why', async () => {
    vi.useFakeTimers();
    const calls = fakeResend([403, 403, 403, 403, 403]);
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a']);
    const as = await admin(t);
    await as.mutation(api.cercleMailing.sendConfirmations, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.length).toBe(CERCLE_CONFIRM_MAX_SENDS);
    const [c] = await contacts(t);
    expect(c.confirmSends).toBe(CERCLE_CONFIRM_MAX_SENDS);
    expect(c.confirmError).toContain('403');
    // Past the bound, a new run asks nobody.
    calls.length = 0;
    expect(await as.mutation(api.cercleMailing.sendConfirmations, {})).toEqual({
      queued: 0,
    });
  });
});

describe('Cercle mailing — the person answers', () => {
  async function asked() {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a']);
    await (await admin(t)).mutation(api.cercleMailing.sendConfirmations, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { t, html: calls[0].emails[0].html };
  }

  it('clicking the link confirms, once, and keeps the proof', async () => {
    const { t, html } = await asked();
    const token = tokenIn(html, 'confirmation');
    expect(await t.mutation(api.cercleMailing.confirm, { token })).toEqual({
      status: 'confirmed',
      locale: null,
    });
    const [c] = await contacts(t);
    expect(c).toMatchObject({
      status: 'confirmed',
      consent: { via: 'confirmation_link' },
    });
    expect(c.confirmTokenHash).toBeUndefined();
    // Single use.
    expect(
      (await t.mutation(api.cercleMailing.confirm, { token })).status,
    ).toBe('invalid');
  });

  it('refuses a made-up token and an expired one', async () => {
    const { t, html } = await asked();
    expect(
      (await t.mutation(api.cercleMailing.confirm, { token: 'nope' })).status,
    ).toBe('invalid');
    expect(
      (await t.mutation(api.cercleMailing.confirm, { token: 'a'.repeat(64) }))
        .status,
    ).toBe('invalid');
    const [c] = await contacts(t);
    await t.run((ctx) =>
      ctx.db.patch(c._id, { confirmExpiresAt: Date.now() - 1000 }),
    );
    expect(
      (
        await t.mutation(api.cercleMailing.confirm, {
          token: tokenIn(html, 'confirmation'),
        })
      ).status,
    ).toBe('expired');
  });

  it('unsubscribing keeps a suppression entry, is idempotent, and works for a pending contact too', async () => {
    const { t, html } = await asked();
    const token = tokenIn(html, 'desinscription');
    expect(await t.mutation(api.cercleMailing.unsubscribe, { token })).toEqual({
      ok: true,
      found: true,
    });
    const [c] = await contacts(t);
    expect(c).toMatchObject({ status: 'unsubscribed' });
    expect(c.confirmTokenHash).toBeUndefined();
    expect(typeof c.unsubscribedAt).toBe('number');
    // The old confirm link no longer works.
    expect(
      (
        await t.mutation(api.cercleMailing.confirm, {
          token: tokenIn(html, 'confirmation'),
        })
      ).status,
    ).toBe('invalid');
    expect(await t.mutation(api.cercleMailing.unsubscribe, { token })).toEqual({
      ok: true,
      found: true,
    });
    expect(
      await t.mutation(api.cercleMailing.unsubscribe, {
        token: 'f'.repeat(32),
      }),
    ).toEqual({
      ok: true,
      found: false,
    });
    expect(
      await t.mutation(api.cercleMailing.unsubscribe, { token: 'bad' }),
    ).toEqual({
      ok: false,
      found: false,
    });
  });

  it('an unanswered contact is deleted at its deadline; a confirmed or unsubscribed one is not', async () => {
    vi.useFakeTimers();
    fakeResend();
    const t = convexTest(schema, modules);
    await importAddresses(t, ['stale', 'fresh', 'yes', 'no']);
    const rows = await contacts(t);
    const by = (label: string) => rows.find((r) => r.email === addr(label))!;
    await t.run(async (ctx) => {
      await ctx.db.patch(by('stale')._id, {
        confirmExpiresAt: Date.now() - 1000,
      });
      await ctx.db.patch(by('fresh')._id, {
        confirmExpiresAt: Date.now() + 1000,
      });
      await ctx.db.patch(by('yes')._id, { status: 'confirmed' });
      await ctx.db.patch(by('no')._id, { status: 'unsubscribed' });
    });
    expect(
      await t.mutation(internal.cercleMailing.purgeExpiredPending, {}),
    ).toEqual({ deleted: 1 });
    expect((await contacts(t)).map((r) => r.email).sort()).toEqual(
      [addr('fresh'), addr('no'), addr('yes')].sort(),
    );
  });
});

describe('Cercle mailing — the president’s screen and the HTTP unsubscribe', () => {
  it('stats and contact list are administrator-only and count by status', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a', 'b']);
    const as = await admin(t);
    const [first] = await contacts(t);
    await t.run((ctx) => ctx.db.patch(first._id, { status: 'confirmed' }));
    const stats = await as.query(api.cercleMailing.stats, {});
    expect(stats).toMatchObject({
      pending: 1,
      toAsk: 1,
      confirmed: 1,
      unsubscribed: 0,
    });
    expect(stats.sender.placeholder).toBe(false);
    const list = await as.query(api.cercleMailing.listContacts, {
      status: 'pending',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toHaveLength(1);
    const member = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'm@example.test', role: 'membre' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${member}|s` })
        .query(api.cercleMailing.stats, {}),
    ).rejects.toThrow();
    await expect(
      t.query(api.cercleMailing.listContacts, {
        status: 'pending',
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
  });

  it('one-click: POST unsubscribes, GET only redirects (a prefetch must not unsubscribe)', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    await importAddresses(t, ['a']);
    const [c] = await contacts(t);

    const get = await t.fetch(
      `/cercle/unsubscribe?token=${c.unsubToken}&l=en`,
      { method: 'GET', redirect: 'manual' },
    );
    expect(get.status).toBe(302);
    expect(get.headers.get('Location')).toBe(
      `https://dt.test/en/cercle/desinscription?token=${c.unsubToken}`,
    );
    expect((await contacts(t))[0].status).toBe('pending');

    const post = await t.fetch(`/cercle/unsubscribe?token=${c.unsubToken}`, {
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
    });
    expect(post.status).toBe(200);
    expect((await contacts(t))[0].status).toBe('unsubscribed');

    expect(
      (await t.fetch('/cercle/unsubscribe?token=nope', { method: 'POST' }))
        .status,
    ).toBe(400);
  });
});

describe('Cercle mailing — joining through an accepted request', () => {
  async function request(t: T, email: string) {
    const cv = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(['%PDF-1.4 cv']));
      await ctx.db.insert('cercleUploads', {
        storageId,
        createdAt: Date.now(),
      });
      return storageId;
    });
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    return await t.action(api.cercle.submitRequest, {
      name: 'Alex Fictif',
      email,
      locale: 'en',
      cvStorageId: cv,
      cvFileName: 'cv.pdf',
      acceptCharter: true,
      acceptNotice: true,
    });
  }

  it('approval puts the person on the list as confirmed, with the proof they gave', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await request(t, 'alex@example.test');
    const as = await admin(t);
    await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'approved',
    });
    const [c] = await contacts(t);
    const req = await t.run((ctx) => ctx.db.get(id));
    expect(c).toMatchObject({
      email: 'alex@example.test',
      status: 'confirmed',
      source: 'request',
      locale: 'en',
      consent: { via: 'request', textVersion: req!.consent.noticeVersion },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('refusal puts nobody on the list; a new request lifts an earlier unsubscribe', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const as = await admin(t);
    const first = await request(t, 'alex@example.test');
    await as.mutation(api.cercle.reviewRequest, {
      requestId: first,
      decision: 'rejected',
    });
    expect(await contacts(t)).toHaveLength(0);

    await t.run((ctx) =>
      ctx.db.insert('cercleContacts', {
        email: 'alex@example.test',
        status: 'unsubscribed',
        source: 'import',
        unsubToken: 'a'.repeat(32),
        confirmSends: 1,
        unsubscribedAt: 1,
        createdAt: 1,
      }),
    );
    const second = await request(t, 'alex@example.test');
    await as.mutation(api.cercle.reviewRequest, {
      requestId: second,
      decision: 'approved',
    });
    const rows = await contacts(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'confirmed' });
    expect(rows[0].unsubscribedAt).toBeUndefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Cercle mailing — a campaign to the list, kept apart from the newsletter', () => {
  async function seedBoth(t: T) {
    await t.run(async (ctx) => {
      const sub = (email: string) =>
        ctx.db.insert('newsletterSubscriptions', {
          email,
          unsubToken: hex(email),
          createdAt: 0,
          status: 'confirmed',
          locale: 'fr',
        });
      await sub('news1@dt.test');
      await sub('news2@dt.test');
      const contact = (
        email: string,
        status: 'confirmed' | 'pending' | 'unsubscribed',
      ) =>
        ctx.db.insert('cercleContacts', {
          email,
          status,
          source: 'request',
          unsubToken: hex(email),
          confirmSends: 0,
          createdAt: 0,
          locale: 'fr',
        });
      await contact('cercle1@dt.test', 'confirmed');
      await contact('cercle2@dt.test', 'confirmed');
      await contact('attente@dt.test', 'pending');
      await contact('parti@dt.test', 'unsubscribed');
    });
    const editorId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'ed@example.test', role: 'editeur' }),
    );
    return t.withIdentity({ subject: `${editorId}|s` });
  }

  it('a Cercle campaign reaches the confirmed Cercle contacts only, with the Cercle footer and headers', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedBoth(t);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Nouvelles du Cercle',
      body: 'Quelques nouvelles.',
      audience: 'cercle',
    });
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(sentTo(calls).sort()).toEqual([
      'cercle1@dt.test',
      'cercle2@dt.test',
    ]);
    for (const e of calls.flatMap((c) => c.emails)) {
      expect(e.headers?.['List-Unsubscribe']).toMatch(
        /^<https:\/\/api\.dt\.test\/cercle\/unsubscribe\?token=[0-9a-z]{32}&l=fr>$/,
      );
      expect(e.headers?.['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click',
      );
      expect(e.html).toContain('/cercle/desinscription?token=');
      expect(e.html).not.toContain('/newsletter/desinscription');
      expect(e.html).toContain('Association Fictive');
      expect(e.html).toContain('1 rue Imaginaire, 75000 Ville');
    }
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      audience: 'cercle',
      totalCount: 2,
      recipientCount: 2,
    });
    const rows = await t.run((ctx) =>
      ctx.db.query('newsletterDeliveries').collect(),
    );
    expect(rows.every((r) => r.contactId && !r.subscriptionId)).toBe(true);
  });

  it('a newsletter campaign never reaches the Cercle’s list', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedBoth(t);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'La lettre',
      body: 'Les travaux du réseau.',
    });
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sentTo(calls).sort()).toEqual(['news1@dt.test', 'news2@dt.test']);
    expect((await t.run((ctx) => ctx.db.get(id)))?.audience).toBeUndefined();
  });

  it('the two lists’ campaigns are listed apart', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedBoth(t);
    await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Lettre A',
      body: 'Corps de la lettre.',
    });
    await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Cercle B',
      body: 'Corps du message.',
      audience: 'cercle',
    });
    const news = await editor.query(api.newsletter.listCampaigns, {});
    const circle = await editor.query(api.newsletter.listCampaigns, {
      audience: 'cercle',
    });
    expect(news.map((c) => c.subject)).toEqual(['Lettre A']);
    expect(circle.map((c) => c.subject)).toEqual(['Cercle B']);
    expect(circle[0].audience).toBe('cercle');
  });

  it('a Cercle campaign is refused while the sender identity is a placeholder', async () => {
    fakeResend([], false);
    const t = convexTest(schema, modules);
    const editor = await seedBoth(t);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Nouvelles du Cercle',
      body: 'Quelques nouvelles.',
      audience: 'cercle',
    });
    await expect(
      editor.mutation(api.newsletter.sendCampaign, { campaignId: id }),
    ).rejects.toThrow(/SENDER_IDENTITY_MISSING/);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('draft');
  });

  it('someone who unsubscribes between queueing and sending is skipped', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedBoth(t);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Nouvelles du Cercle',
      body: 'Quelques nouvelles.',
      audience: 'cercle',
    });
    await t.run((ctx) => ctx.db.patch(id, { status: 'sending' }));
    await t.mutation(internal.newsletter._enqueue, {
      campaignId: id,
      cursor: null,
    });
    const c2 = (await contacts(t)).find((c) => c.email === 'cercle2@dt.test')!;
    await t.mutation(api.cercleMailing.unsubscribe, { token: c2.unsubToken });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sentTo(calls)).toEqual(['cercle1@dt.test']);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      recipientCount: 1,
      skippedCount: 1,
    });
  });
});
