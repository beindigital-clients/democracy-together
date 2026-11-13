// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import {
  ALERT_RECIPIENTS_MAX,
  ALERT_WINDOW_MS,
  alertRecipients,
  planAlert,
} from './lib/cercleAlert';
import { cercleRequestAlertEmail } from './lib/cercleEmails';
import { SITE_LOCALES } from './lib/locales';

// CERCLE DES AMIS — E-MAIL ALERT WHEN A REQUEST ARRIVES.
//
// Recipients are test addresses of Resend (`delivered+label@resend.dev`); the
// provider is a substitute `fetch` that records every message, so a test can say
// exactly who was told what, and when.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = TestConvex<typeof schema>;
type Mail = { to: string; subject: string; html: string };

const A = 'delivered+alert-a@resend.dev';
const B = 'delivered+alert-b@resend.dev';
const isAlert = (m: Mail) =>
  /Cercle des Amis :|Circle of Friends:/.test(m.subject);

beforeEach(() => {
  vi.stubEnv('RECAPTCHA_DISABLED', 'true');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// `failFor`: addresses the provider refuses (HTTP 500), to exercise a failure.
function fakeProvider(failFor: string[] = []) {
  const mails: Mail[] = [];
  vi.stubEnv('AUTH_RESEND_KEY', 're_test');
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
  vi.stubEnv('SITE_URL', 'https://dt.test');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as {
        to: string[];
        subject: string;
        html: string;
      };
      const to = body.to[0];
      if (failFor.includes(to)) return new Response('boom', { status: 500 });
      mails.push({ to, subject: body.subject, html: body.html });
      return new Response('{}', { status: 200 });
    }),
  );
  return mails;
}

let seq = 0;
async function submit(
  t: T,
  email = `delivered+applicant-${++seq}@resend.dev`,
  extra: Record<string, unknown> = {},
) {
  const cv = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(['%PDF-1.4 CV FICTIF'], { type: 'application/pdf' }),
    );
    await ctx.db.insert('cercleUploads', { storageId, createdAt: Date.now() });
    return storageId;
  });
  return await t.action(api.cercle.submitRequest, {
    name: 'Alex Fictif',
    email,
    cvStorageId: cv,
    cvFileName: 'cv.pdf',
    acceptCharter: true,
    acceptNotice: true,
    ...extra,
  });
}

// Lets the scheduled functions due NOW run, without advancing to the far ones.
async function settle(t: T) {
  await vi.advanceTimersByTimeAsync(100);
  await t.finishInProgressScheduledFunctions();
}

const alerts = (mails: Mail[]) => mails.filter(isAlert);
const state = (t: T) =>
  t.run((ctx) => ctx.db.query('cercleAlertState').collect());

describe('Alert — rules', () => {
  it('reads the recipients from the variable, drops what is not a real address, and bounds them', () => {
    expect(alertRecipients(undefined)).toEqual([]);
    expect(alertRecipients('')).toEqual([]);
    expect(alertRecipients('   ')).toEqual([]);
    expect(
      alertRecipients(
        ` ${A.toUpperCase()}, ${B};${A}  pas-une-adresse, nobody@example.test, x@sub.localhost `,
      ),
    ).toEqual([A, B]);
    const many = Array.from(
      { length: 12 },
      (_, i) => `delivered+r${i}@resend.dev`,
    ).join(',');
    expect(alertRecipients(many)).toHaveLength(ALERT_RECIPIENTS_MAX);
  });

  it('tells at once the first time, then covers the window with ONE follow-up', () => {
    const t0 = 1_000_000;
    expect(planAlert(null, t0)).toEqual({ kind: 'now' });
    expect(planAlert({ lastAlertAt: t0 }, t0 + 60_000)).toEqual({
      kind: 'follow-up',
      delayMs: ALERT_WINDOW_MS - 60_000,
    });
    // Follow-up already scheduled: nothing to add.
    expect(
      planAlert(
        { lastAlertAt: t0, followUpAt: t0 + ALERT_WINDOW_MS },
        t0 + 120_000,
      ),
    ).toEqual({
      kind: 'none',
    });
    // The window is over: a new request tells at once again.
    expect(planAlert({ lastAlertAt: t0 }, t0 + ALERT_WINDOW_MS)).toEqual({
      kind: 'now',
    });
    expect(
      planAlert(
        { lastAlertAt: t0, followUpAt: t0 + ALERT_WINDOW_MS },
        t0 + ALERT_WINDOW_MS + 1,
      ),
    ).toEqual({
      kind: 'now',
    });
  });

  it('exists in every language, carries the count and a link built from the site URL', () => {
    for (const locale of SITE_LOCALES) {
      const mail = cercleRequestAlertEmail({
        siteUrl: 'https://dt.test/',
        locale,
        pending: 7,
      });
      expect(mail.url).toBe(`https://dt.test/${locale}/admin/cercle`);
      expect(mail.html).toContain(`https://dt.test/${locale}/admin/cercle`);
      expect(mail.html).toContain('<strong>7</strong>');
      expect(mail.subject.length).toBeGreaterThan(10);
    }
  });
});

describe('Alert — full path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 0, 0));
  });

  it('with no recipient configured: no alert, no state, and the request is stored all the same', async () => {
    const mails = fakeProvider();
    const t = convexTest(schema, modules);
    const id = await submit(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
    expect(alerts(mails)).toHaveLength(0);
    expect(await state(t)).toHaveLength(0);
    // The applicant still gets the receipt: the alert changed nothing for them.
    expect(mails.map((m) => m.to)).toHaveLength(1);

    vi.stubEnv('CERCLE_ALERT_EMAILS', ' , pas-une-adresse ');
    await submit(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(alerts(mails)).toHaveLength(0);
  });

  it('one e-mail per recipient for a new request, with the count and the link, in French by default', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', `${A}, ${B}`);
    const t = convexTest(schema, modules);
    await submit(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const sent = alerts(mails);
    expect(sent.map((m) => m.to).sort()).toEqual([A, B]);
    for (const m of sent) {
      expect(m.subject).toContain(
        'Cercle des Amis : une demande attend une décision',
      );
      expect(m.html).toContain('<strong>1</strong>');
      expect(m.html).toContain('https://dt.test/fr/admin/cercle');
    }
    expect(await state(t)).toHaveLength(1);
  });

  it('puts nothing about the applicant in the alert', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', A);
    vi.stubEnv('CERCLE_CV_AI_ENABLED', 'true');
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    vi.stubEnv('CERCLE_CV_AI_MOCK', 'true');
    const t = convexTest(schema, modules);
    const email = 'delivered+zoe-secrete@resend.dev';
    await submit(t, email, {
      name: 'Zoé Secrète-Personne',
      motivation: 'MOTIVATION-TRES-PRIVEE',
      cvFileName: 'cv-de-zoe-secrete.pdf',
      country: 'Pays-Secret',
      acceptCvAi: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [alert] = alerts(mails);
    expect(alert).toBeDefined();
    const everything = `${alert.subject}\n${alert.html}`;
    for (const secret of [
      'Zoé',
      'Secrète',
      'MOTIVATION',
      'cv-de-zoe',
      'Pays-Secret',
      'zoe-secrete',
      'Résumé fictif',
      'Master fictif',
    ]) {
      expect(everything, secret).not.toContain(secret);
    }
  });

  it('inside the window: one follow-up at its end carries the count, not one e-mail per request', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', A);
    const t = convexTest(schema, modules);

    await submit(t);
    await settle(t);
    expect(alerts(mails)).toHaveLength(1);
    expect(alerts(mails)[0].html).toContain('<strong>1</strong>');

    // Two more in the next minutes: nothing goes out yet.
    vi.setSystemTime(Date.now() + 2 * 60_000);
    await submit(t);
    vi.setSystemTime(Date.now() + 3 * 60_000);
    await submit(t);
    await settle(t);
    expect(alerts(mails)).toHaveLength(1);
    expect(await state(t)).toMatchObject([{ followUpAt: expect.any(Number) }]);

    // The window ends: ONE follow-up, with the count of everything waiting.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(alerts(mails)).toHaveLength(2);
    expect(alerts(mails)[1].html).toContain('<strong>3</strong>');
    const [row] = await state(t);
    expect(row.followUpAt).toBeUndefined();
  });

  it('the follow-up is dropped when every request was decided meanwhile', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', A);
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: 'president@example.test',
        role: 'admin',
      }),
    );
    const admin = t.withIdentity({ subject: `${adminId}|s` });
    const first = await submit(t);
    await settle(t);
    vi.setSystemTime(Date.now() + 60_000);
    const second = await submit(t);
    for (const requestId of [first, second]) {
      await admin.mutation(api.cercle.reviewRequest, {
        requestId,
        decision: 'rejected',
      });
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(alerts(mails)).toHaveLength(1);
  });

  it('a request after the window tells at once again', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', A);
    const t = convexTest(schema, modules);
    await submit(t);
    await settle(t);
    vi.setSystemTime(Date.now() + ALERT_WINDOW_MS + 1000);
    await submit(t);
    await settle(t);
    expect(alerts(mails)).toHaveLength(2);
    expect(alerts(mails)[1].html).toContain('<strong>2</strong>');
  });

  it('a request from a reserved test address tells no one, like the receipt', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', A);
    const t = convexTest(schema, modules);
    const id = await submit(t, 'someone@example.test');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
    expect(mails).toHaveLength(0);
    expect(await state(t)).toHaveLength(0);
  });

  it('writes to a recipient in the language of their account', async () => {
    const mails = fakeProvider();
    vi.stubEnv('CERCLE_ALERT_EMAILS', `${A}, ${B}`);
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', {
        email: B,
        role: 'admin',
        preferredLocale: 'en',
      }),
    );
    await submit(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const byTo = new Map(alerts(mails).map((m) => [m.to, m]));
    expect(byTo.get(A)?.subject).toContain('Cercle des Amis');
    expect(byTo.get(B)?.subject).toContain(
      'Circle of Friends: a request is waiting for a decision',
    );
    expect(byTo.get(B)?.html).toContain('https://dt.test/en/admin/cercle');
  });

  it('a send failure does not break the request, nor deprive the other recipient, and is logged without addresses', async () => {
    const mails = fakeProvider([A]);
    vi.stubEnv('CERCLE_ALERT_EMAILS', `${A}, ${B}`);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = convexTest(schema, modules);
    const id = await submit(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
    expect(alerts(mails).map((m) => m.to)).toEqual([B]);
    const line = log.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.startsWith('Cercle request alert'));
    expect(line).toMatch(/1\/2 not sent/);
    expect(line).not.toContain('resend.dev');
    log.mockRestore();
  });

  it('a provider that is down for everyone still stores the request', async () => {
    fakeProvider([A, B]);
    vi.stubEnv('CERCLE_ALERT_EMAILS', `${A}, ${B}`);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = convexTest(schema, modules);
    const id = await submit(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
    log.mockRestore();
  });
});
