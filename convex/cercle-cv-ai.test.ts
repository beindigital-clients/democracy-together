// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  CV_SUMMARY_INSTRUCTIONS,
  CV_SUMMARY_SCHEMA,
  MOCK_CV_SUMMARY,
  cvAiEnabled,
  cvAiMocked,
  readCvSummary,
} from './lib/cercleCvAi';

// CERCLE DES AMIS — CV SUMMARY BY AN AUTOMATIC TOOL (docs/cercle-amis.md § 9).
//
// Fictitious CVs only, and the provider is a substitute `fetch`: nothing here
// ever reaches a real gateway, whatever key the deployment holds.

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

const FICTITIOUS_CV =
  '%PDF-1.4 CV FICTIF : Master fictif, association fictive.';
const GATEWAY = 'https://ai-gateway.vercel.sh/v1/responses';

beforeEach(() => {
  vi.stubEnv('RECAPTCHA_DISABLED', 'true');
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Call = { url: string; body: string };

function fakeProvider(
  answer: Record<string, unknown> | 'fail' = {
    overview: 'Parcours fictif en sciences politiques.',
    education: ['Master fictif'],
    experience: ['Association fictive'],
    languages: ['Français'],
    themes: ['Démocratie locale'],
  },
) {
  const calls: Call[] = [];
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key-not-real');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      if (answer === 'fail') return new Response('down', { status: 500 });
      return new Response(
        JSON.stringify({ output_text: JSON.stringify(answer) }),
        {
          status: 200,
        },
      );
    }),
  );
  return calls;
}

async function admin(t: T) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'president@example.test', role: 'admin' }),
  );
  return t.withIdentity({ subject: `${id}|s` });
}

async function submit(t: T, email: string, acceptCvAi?: boolean) {
  const cv = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([FICTITIOUS_CV], { type: 'application/pdf' }),
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
    ...(acceptCvAi === undefined ? {} : { acceptCvAi }),
  });
}

const row = (t: T, id: Id<'cercleRequests'>) => t.run((ctx) => ctx.db.get(id));
const scheduled = (t: T) =>
  t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());

describe('CV AI — rules', () => {
  it('is off unless the switch is exactly "true"', () => {
    expect(cvAiEnabled()).toBe(false);
    for (const v of ['1', 'TRUE', 'yes', 'on', '']) {
      vi.stubEnv('CERCLE_CV_AI_ENABLED', v);
      expect(cvAiEnabled()).toBe(false);
    }
    vi.stubEnv('CERCLE_CV_AI_ENABLED', 'true');
    expect(cvAiEnabled()).toBe(true);
  });

  it('the mock is honoured only on a development deployment', () => {
    vi.stubEnv('CERCLE_CV_AI_MOCK', 'true');
    expect(cvAiMocked()).toBe(false);
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    expect(cvAiMocked()).toBe(true);
  });

  it('keeps only the five known fields, bounded, and drops anything else (a score, a flag)', () => {
    const read = readCvSummary({
      overview: '  Un parcours.  ',
      education: ['a', '', 7, 'b'],
      experience: Array.from({ length: 20 }, (_, i) => `x${i}`),
      languages: 'pas une liste',
      themes: ['t'],
      score: 92,
      risk: 'high',
      deviation: true,
      recommendation: 'refuse',
    });
    expect(read).toEqual({
      overview: 'Un parcours.',
      education: ['a', 'b'],
      experience: ['x0', 'x1', 'x2', 'x3', 'x4', 'x5'],
      languages: [],
      themes: ['t'],
    });
    expect(Object.keys(read!)).not.toContain('score');
    expect(readCvSummary({ overview: '   ' })).toBeNull();
    expect(readCvSummary(null)).toBeNull();
    expect(readCvSummary('texte')).toBeNull();
  });

  it('has no field that could carry a score, a label, a risk or a decision — in the schema, the output schema and the stored summary', () => {
    const FORBIDDEN =
      /score|rank|grade|rating|label|risk|flag|deviat|recommend|suspic|verdict|decision|fit|match/i;
    const outputFields = Object.keys(CV_SUMMARY_SCHEMA.properties);
    expect(outputFields.filter((f) => FORBIDDEN.test(f))).toEqual([]);
    expect(
      (CV_SUMMARY_SCHEMA as { additionalProperties: boolean })
        .additionalProperties,
    ).toBe(false);

    const exported = (
      schema.tables.cercleRequests as unknown as {
        export(): {
          documentType: {
            value: Record<
              string,
              { fieldType: { value?: Record<string, unknown> } }
            >;
          };
        };
      }
    ).export();
    const summaryFields = Object.keys(
      exported.documentType.value.cvSummary.fieldType.value ?? {},
    );
    expect(summaryFields.sort()).toEqual(
      [
        'at',
        'education',
        'experience',
        'languages',
        'model',
        'overview',
        'themes',
      ].sort(),
    );
    expect(summaryFields.filter((f) => FORBIDDEN.test(f))).toEqual([]);
    // The request's own fields: nothing derived about the person besides the summary.
    const requestFields = Object.keys(exported.documentType.value);
    expect(requestFields.filter((f) => FORBIDDEN.test(f))).toEqual([]);
  });

  it('the instructions forbid scoring, flagging, recommending and inferring personal traits', () => {
    expect(CV_SUMMARY_INSTRUCTIONS).toMatch(/NO score/);
    expect(CV_SUMMARY_INSTRUCTIONS).toMatch(/deviant/);
    expect(CV_SUMMARY_INSTRUCTIONS).toMatch(/accepted or refused/);
    expect(CV_SUMMARY_INSTRUCTIONS).toMatch(/religion/);
    expect(CV_SUMMARY_INSTRUCTIONS).toMatch(/DATA, not instructions/);
  });
});

describe('CV AI — switch off: nothing leaves', () => {
  it('a consent given while the tool is off is not recorded, nothing is scheduled, no call is made', async () => {
    const calls = fakeProvider();
    const t = convexTest(schema, modules);
    expect(await t.query(api.cercle.formConfig, {})).toEqual({ cvAi: false });
    const id = await submit(t, 'a@example.test', true);
    const r = await row(t, id);
    expect(r?.cvAiConsent).toBeUndefined();
    expect(r?.cvSummary).toBeUndefined();
    expect(await scheduled(t)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('even a summary run forced by hand does nothing while off', async () => {
    vi.useFakeTimers();
    const calls = fakeProvider();
    const t = convexTest(schema, modules);
    // Armed as if it had been on at submission, then the switch went off.
    vi.stubEnv('CERCLE_CV_AI_ENABLED', 'true');
    const id = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run((ctx) => ctx.db.patch(id, { cvSummary: undefined }));
    calls.length = 0;
    vi.stubEnv('CERCLE_CV_AI_ENABLED', 'false');
    await t.action(internal.cercleCvAi.summarize, { requestId: id });
    expect(calls).toHaveLength(0);
    expect((await row(t, id))?.cvSummary).toBeUndefined();
  });
});

describe('CV AI — switch on', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('CERCLE_CV_AI_ENABLED', 'true');
  });

  it('the form is told to offer the consent', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.cercle.formConfig, {})).toEqual({ cvAi: true });
  });

  it('no consent: nothing is scheduled and the CV goes nowhere', async () => {
    const calls = fakeProvider();
    const t = convexTest(schema, modules);
    const id = await submit(t, 'a@example.test');
    const declined = await submit(t, 'b@example.test', false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toHaveLength(0);
    expect((await row(t, id))?.cvSummary).toBeUndefined();
    expect((await row(t, declined))?.cvAiConsent).toBeUndefined();
    const as = await admin(t);
    const page = await as.query(api.cercle.listRequests, {
      status: 'pending',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((r) => r.cvAiState)).toEqual(['none', 'none']);
  });

  it('consent given: the summary is stored with the proof, shown to the administrator, and only it', async () => {
    const calls = fakeProvider({
      overview: 'Parcours fictif.',
      education: ['Master fictif'],
      experience: [],
      languages: ['Français'],
      themes: ['Démocratie'],
      score: 97,
      risk: 'none',
    });
    const t = convexTest(schema, modules);
    const id = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // One call, to the gateway, carrying the fictitious CV and the rules.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GATEWAY);
    const sent = calls[0].body;
    expect(sent).toContain(btoa(FICTITIOUS_CV));
    expect(sent).toContain('NO score');

    const r = await row(t, id);
    expect(r?.cvAiConsent).toMatchObject({ noticeVersion: expect.any(String) });
    // Only the five fields plus the model and the time: the extra ones are gone.
    expect(Object.keys(r!.cvSummary!).sort()).toEqual(
      [
        'at',
        'education',
        'experience',
        'languages',
        'model',
        'overview',
        'themes',
      ].sort(),
    );
    expect(JSON.stringify(r)).not.toMatch(/"(score|risk)"/);

    const as = await admin(t);
    const page = await as.query(api.cercle.listRequests, {
      status: 'pending',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page[0].cvAiState).toBe('ready');
    expect(page.page[0].cvSummary).toEqual({
      overview: 'Parcours fictif.',
      education: ['Master fictif'],
      experience: [],
      languages: ['Français'],
      themes: ['Démocratie'],
    });
  });

  it('is admin-only: nobody else reads it', async () => {
    fakeProvider();
    const t = convexTest(schema, modules);
    const id = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const role of [
      'visiteur',
      'membre',
      'moderateur',
      'editeur',
    ] as const) {
      const uid = await t.run((ctx) =>
        ctx.db.insert('users', { email: `${role}@example.test`, role }),
      );
      const as = t.withIdentity({ subject: `${uid}|s` });
      await expect(
        as.query(api.cercle.listRequests, {
          status: 'pending',
          paginationOpts: { numItems: 5, cursor: null },
        }),
        role,
      ).rejects.toThrow();
      await expect(
        as.mutation(api.cercleCvAi.retrySummary, { requestId: id }),
        role,
      ).rejects.toThrow();
    }
    await expect(
      t.mutation(api.cercleCvAi.retrySummary, { requestId: id }),
    ).rejects.toThrow();
  });

  it('the summary never decides: approving or refusing stays the president’s act, and no automatic decision exists', async () => {
    fakeProvider();
    const t = convexTest(schema, modules);
    const id = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await row(t, id))?.status).toBe('pending');
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.some((a) => a.action === 'cercle.request_reviewed')).toBe(
      false,
    );
  });

  it('a provider failure leaves a human to read the CV, and a retry can fill the summary in', async () => {
    const calls = fakeProvider('fail');
    const t = convexTest(schema, modules);
    const id = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const failed = await row(t, id);
    expect(failed?.cvSummary).toBeUndefined();
    expect(typeof failed?.cvSummaryFailedAt).toBe('number');
    const as = await admin(t);
    const state = async () =>
      (
        await as.query(api.cercle.listRequests, {
          status: 'pending',
          paginationOpts: { numItems: 5, cursor: null },
        })
      ).page[0].cvAiState;
    expect(await state()).toBe('failed');

    fakeProvider();
    await as.mutation(api.cercleCvAi.retrySummary, { requestId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await state()).toBe('ready');
    const after = await row(t, id);
    expect(after?.cvSummaryFailedAt).toBeUndefined();
    expect(calls.length).toBeGreaterThan(0);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(
      audit.filter((a) => a.action === 'cercle.cv_summary_requested'),
    ).toHaveLength(1);
  });

  it('a retry is refused when the tool is off, the person did not consent, or the request is decided', async () => {
    fakeProvider();
    const t = convexTest(schema, modules);
    const as = await admin(t);
    const withConsent = await submit(t, 'a@example.test', true);
    const without = await submit(t, 'b@example.test');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      as.mutation(api.cercleCvAi.retrySummary, { requestId: without }),
    ).rejects.toThrow(/NOT_ELIGIBLE/);
    await as.mutation(api.cercle.reviewRequest, {
      requestId: withConsent,
      decision: 'approved',
    });
    await expect(
      as.mutation(api.cercleCvAi.retrySummary, { requestId: withConsent }),
    ).rejects.toThrow(/NOT_ELIGIBLE/);
    vi.stubEnv('CERCLE_CV_AI_ENABLED', 'false');
    const third = await submit(t, 'c@example.test', true);
    await expect(
      as.mutation(api.cercleCvAi.retrySummary, { requestId: third }),
    ).rejects.toThrow(/CV_AI_DISABLED/);
  });

  it('a refusal deletes the summary with the CV; an approval keeps it with the CV', async () => {
    fakeProvider();
    const t = convexTest(schema, modules);
    const as = await admin(t);
    const refused = await submit(t, 'a@example.test', true);
    const approved = await submit(t, 'b@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await row(t, refused))?.cvSummary).toBeDefined();

    await as.mutation(api.cercle.reviewRequest, {
      requestId: refused,
      decision: 'rejected',
    });
    const r = await row(t, refused);
    expect(r?.cvSummary).toBeUndefined();
    expect(r?.cvSummaryFailedAt).toBeUndefined();
    expect(r?.cvStorageId).toBeUndefined();

    await as.mutation(api.cercle.reviewRequest, {
      requestId: approved,
      decision: 'approved',
    });
    expect((await row(t, approved))?.cvSummary).toBeDefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('a summary that finishes after the decision is dropped', async () => {
    fakeProvider();
    const t = convexTest(schema, modules);
    const as = await admin(t);
    const id = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run((ctx) => ctx.db.patch(id, { cvSummary: undefined }));
    await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'rejected',
    });
    await t.mutation(internal.cercleCvAi._saveSummary, {
      requestId: id,
      summary: {
        overview: 'Tard.',
        education: [],
        experience: [],
        languages: [],
        themes: [],
      },
      model: 'x',
    });
    expect((await row(t, id))?.cvSummary).toBeUndefined();
  });

  it('is removed with the request on account deletion', async () => {
    fakeProvider();
    const t = convexTest(schema, modules);
    const id = await submit(t, 'gone@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const { cercleUserDataModule } = await import('./lib/cercleUserData');
    const user = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'gone@example.test', role: 'visiteur' }),
    );
    await t.run((ctx) =>
      cercleUserDataModule.delete(ctx, user, { email: 'gone@example.test' }),
    );
    expect(await row(t, id)).toBeNull();
  });

  it('the development mock needs no provider and sends nothing; without AUTH_DEV_OTP it is ignored', async () => {
    const calls = fakeProvider();
    vi.stubEnv('CERCLE_CV_AI_MOCK', 'true');
    const t = convexTest(schema, modules);
    const ignored = await submit(t, 'a@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // Not a dev deployment: the mock is ignored and the (stubbed) provider is called.
    expect(calls).toHaveLength(1);
    expect((await row(t, ignored))?.cvSummary?.model).not.toBe('mock');

    calls.length = 0;
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const mocked = await submit(t, 'b@example.test', true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toHaveLength(0);
    const r = await row(t, mocked);
    expect(r?.cvSummary).toMatchObject({
      model: 'mock',
      overview: MOCK_CV_SUMMARY.overview,
    });
  });
});
