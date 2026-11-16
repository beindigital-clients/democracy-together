// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  validateRequestInput,
  cvMetadataVerdict,
  CV_MAX_BYTES,
  MOTIVATION_MAX,
} from './lib/cercle';
import {
  cercleApprovedEmail,
  cercleDeclinedEmail,
  cercleRequestReceivedEmail,
} from './lib/cercleEmails';
import { SITE_LOCALES } from './lib/locales';

// CERCLE DES AMIS — REQUEST TO JOIN (feature 2).
//
// What is pinned here: a pending request gives NO access to anything (the
// person does not even have an account); only an administrator decides;
// approval makes an Ami without ever touching a rank; refusal deletes the CV;
// the CV is only readable by an administrator, and each opening is audited.
// Every address is a reserved test domain: no e-mail is ever sent.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
beforeEach(() => {
  vi.stubEnv('RECAPTCHA_DISABLED', 'true');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
  }
});

type T = ReturnType<typeof newConvexTest>;

const PDF = new Blob(['%PDF-1.4 fictitious cv'], { type: 'application/pdf' });
const NOT_PDF = new Blob(['MZ this is not a pdf'], { type: 'application/pdf' });

// A CV as the upload endpoint leaves it: a stored blob AND its upload row.
async function storeBlob(t: T, blob: Blob = PDF): Promise<Id<'_storage'>> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(blob);
    await ctx.db.insert('cercleUploads', { storageId, createdAt: Date.now() });
    return storageId;
  });
}

function requestArgs(
  cvStorageId: Id<'_storage'>,
  over: Record<string, unknown> = {},
) {
  return {
    name: 'Alex Fictif',
    email: 'Alex.Fictif@example.test',
    country: 'FR',
    motivation: 'Je souhaite aider à animer une base territoriale.',
    locale: 'fr' as const,
    cvStorageId,
    cvFileName: 'cv-alex.pdf',
    acceptCharter: true as const,
    acceptNotice: true as const,
    ...over,
  };
}

async function admin(t: T) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'president@example.test', role: 'admin' }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

describe('Cercle request — pure rules', () => {
  it('trims, normalizes the address and bounds the text', () => {
    const ok = validateRequestInput({
      name: '  Alex  ',
      email: '  A@Example.TEST ',
      motivation: '  hello ',
    });
    expect(ok).toEqual({
      ok: true,
      value: {
        name: 'Alex',
        email: 'a@example.test',
        country: undefined,
        motivation: 'hello',
      },
    });
    expect(
      validateRequestInput({ name: 'A', email: 'a@example.test' }),
    ).toEqual({
      ok: false,
      code: 'INVALID_NAME',
    });
    expect(validateRequestInput({ name: 'Alex', email: 'nope' })).toEqual({
      ok: false,
      code: 'INVALID_EMAIL',
    });
    expect(
      validateRequestInput({
        name: 'Alex',
        email: 'a@example.test',
        motivation: 'x'.repeat(MOTIVATION_MAX + 1),
      }),
    ).toEqual({ ok: false, code: 'INVALID_MOTIVATION' });
  });

  it('judges a stored blob by size and type', () => {
    expect(cvMetadataVerdict(null)).toBe('INVALID_FILE');
    expect(cvMetadataVerdict({ size: 0, contentType: 'application/pdf' })).toBe(
      'INVALID_FILE',
    );
    expect(cvMetadataVerdict({ size: CV_MAX_BYTES + 1 })).toBe('INVALID_FILE');
    expect(cvMetadataVerdict({ size: 10, contentType: 'image/png' })).toBe(
      'INVALID_FILE',
    );
    expect(
      cvMetadataVerdict({ size: 10, contentType: 'application/pdf' }),
    ).toBe('ok');
  });
});

describe('Cercle request — submitting', () => {
  it('stores a pending request with proof of consent and gives NO access', async () => {
    const t = newConvexTest();

    const cv = await storeBlob(t);
    const id = await t.action(api.cercle.submitRequest, requestArgs(cv));
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      status: 'pending',
      email: 'alex.fictif@example.test',
      cvStorageId: cv,
      consent: {
        charterVersion: expect.any(String),
        noticeVersion: expect.any(String),
      },
    });

    // NO account was created, nothing is open to the person.
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users).toHaveLength(0);
    expect(await t.query(api.cercle.access, {})).toEqual({ level: 'none' });
  });

  it('a signed-in visitor who asks stays a visitor with no Cercle access', async () => {
    const t = newConvexTest();
    const visitor = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'v@example.test', role: 'visiteur' }),
    );
    const me = t.withIdentity({ subject: `${visitor}|s` });
    const cv = await storeBlob(t);
    const id = await me.action(
      api.cercle.submitRequest,
      requestArgs(cv, { email: 'v@example.test' }),
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.applicantUserId).toBe(
      visitor,
    );
    expect(await me.query(api.cercle.access, {})).toEqual({ level: 'none' });
  });

  it('refuses a file that is not a PDF and deletes it', async () => {
    const t = newConvexTest();
    const bad = await storeBlob(t, NOT_PDF);
    await expect(
      t.action(api.cercle.submitRequest, requestArgs(bad)),
    ).rejects.toThrow(/FILE_CONTENT_MISMATCH/);
    expect(await t.run((ctx) => ctx.db.system.get(bad))).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query('cercleRequests').collect()),
    ).toHaveLength(0);
  });

  it('refuses an oversized file and a missing charter acceptance', async () => {
    const t = newConvexTest();
    const big = await storeBlob(
      t,
      new Blob(['%PDF-' + 'x'.repeat(CV_MAX_BYTES)], {
        type: 'application/pdf',
      }),
    );
    await expect(
      t.action(api.cercle.submitRequest, requestArgs(big)),
    ).rejects.toThrow(/INVALID_FILE/);
    const cv = await storeBlob(t);
    await expect(
      t.action(
        api.cercle.submitRequest,
        requestArgs(cv, { acceptCharter: false }),
      ),
    ).rejects.toThrow();
    await expect(
      t.action(
        api.cercle.submitRequest,
        requestArgs(cv, { acceptNotice: false }),
      ),
    ).rejects.toThrow();
  });

  it('allows only one pending request per address, case-insensitively', async () => {
    const t = newConvexTest();
    await t.action(api.cercle.submitRequest, requestArgs(await storeBlob(t)));
    const second = await storeBlob(t);
    await expect(
      t.action(
        api.cercle.submitRequest,
        requestArgs(second, { email: 'ALEX.FICTIF@EXAMPLE.TEST' }),
      ),
    ).rejects.toThrow(/DUPLICATE_REQUEST/);
    // The refused request's CV is not kept.
    expect(await t.run((ctx) => ctx.db.system.get(second))).toBeNull();
  });

  it('does not reveal whether an address already has an account', async () => {
    const t = newConvexTest();
    await t.run((ctx) =>
      ctx.db.insert('users', { email: 'known@example.test', role: 'membre' }),
    );
    const known = await t.action(
      api.cercle.submitRequest,
      requestArgs(await storeBlob(t), { email: 'known@example.test' }),
    );
    const unknown = await t.action(
      api.cercle.submitRequest,
      requestArgs(await storeBlob(t), { email: 'unknown@example.test' }),
    );
    expect(known).toBeTruthy();
    expect(unknown).toBeTruthy();
  });
});

describe('Cercle request — the president decides', () => {
  async function pending(t: T, email = 'alex.fictif@example.test') {
    return await t.action(
      api.cercle.submitRequest,
      requestArgs(await storeBlob(t), { email }),
    );
  }

  it('only an administrator lists, opens a CV and decides', async () => {
    const t = newConvexTest();
    const id = await pending(t);
    const roles = ['visiteur', 'membre', 'moderateur', 'editeur'] as const;
    for (const role of roles) {
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
        as.mutation(api.cercle.openCv, { requestId: id }),
        role,
      ).rejects.toThrow();
      await expect(
        as.mutation(api.cercle.reviewRequest, {
          requestId: id,
          decision: 'approved',
        }),
        role,
      ).rejects.toThrow();
      await expect(
        as.query(api.cercle.pendingCount, {}),
        role,
      ).rejects.toThrow();
    }
    await expect(
      t.mutation(api.cercle.reviewRequest, {
        requestId: id,
        decision: 'approved',
      }),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
  });

  it('lists pending requests oldest first and counts them', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    await pending(t, 'one@example.test');
    await pending(t, 'two@example.test');
    const page = await as.query(api.cercle.listRequests, {
      status: 'pending',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((r) => r.email)).toEqual([
      'one@example.test',
      'two@example.test',
    ]);
    expect(page.page[0]).toMatchObject({ hasCv: true, cvDeleted: false });
    expect(await as.query(api.cercle.pendingCount, {})).toBe(2);
  });

  it('opening a CV returns a URL and is audited', async () => {
    const t = newConvexTest();
    const { id: adminId, as } = await admin(t);
    const id = await pending(t);
    expect(await as.mutation(api.cercle.openCv, { requestId: id })).toEqual(
      expect.any(String),
    );
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    const viewed = audit.filter((a) => a.action === 'cercle.cv_viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({ actorId: adminId, targetId: id });
  });

  it('approval creates a plain visitor with the Ami status and opens the Cercle', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    const id = await pending(t);
    const { userId } = await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'approved',
      notes: 'Profil adapté',
    });
    expect(userId).not.toBeNull();
    const user = await t.run((ctx) => ctx.db.get(userId!));
    expect(user).toMatchObject({
      email: 'alex.fictif@example.test',
      role: 'visiteur',
      preferredLocale: 'fr',
    });
    expect(typeof user?.amiSince).toBe('number');

    const ami = t.withIdentity({ subject: `${userId}|s` });
    expect(await ami.query(api.cercle.access, {})).toEqual({ level: 'ami' });

    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ status: 'approved', memberUserId: userId });
    // The CV stays on file for an approved Ami.
    expect(row?.cvStorageId).toBeDefined();
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.some((a) => a.action === 'cercle.request_reviewed')).toBe(
      true,
    );
    expect(audit.some((a) => a.action === 'user.ami_granted')).toBe(true);
  });

  it('approving an existing account never touches its rank', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    const moderator = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'mod@example.test', role: 'moderateur' }),
    );
    const id = await pending(t, 'mod@example.test');
    await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'approved',
    });
    const after = await t.run((ctx) => ctx.db.get(moderator));
    expect(after?.role).toBe('moderateur');
    expect(typeof after?.amiSince).toBe('number');
    // No duplicate account.
    const same = await t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', 'mod@example.test'))
        .collect(),
    );
    expect(same).toHaveLength(1);
  });

  it('refusal deletes the CV, grants nothing and leaves no account', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    const id = await pending(t);
    const cv = (await t.run((ctx) => ctx.db.get(id)))!.cvStorageId!;
    await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'rejected',
      notes: 'Hors périmètre',
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ status: 'rejected' });
    expect(row?.cvStorageId).toBeUndefined();
    expect(typeof row?.cvDeletedAt).toBe('number');
    expect(await t.run((ctx) => ctx.db.system.get(cv))).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('users')
          .withIndex('email', (q) => q.eq('email', 'alex.fictif@example.test'))
          .first(),
      ),
    ).toBeNull();
    expect(await as.mutation(api.cercle.openCv, { requestId: id })).toBeNull();
  });

  it('a decision is final: no replay, no reversal', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    const id = await pending(t);
    await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'approved',
    });
    await expect(
      as.mutation(api.cercle.reviewRequest, {
        requestId: id,
        decision: 'approved',
      }),
    ).rejects.toThrow(/ALREADY_REVIEWED/);
    await expect(
      as.mutation(api.cercle.reviewRequest, {
        requestId: id,
        decision: 'rejected',
      }),
    ).rejects.toThrow(/ALREADY_REVIEWED/);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(
      audit.filter((a) => a.action === 'cercle.request_reviewed'),
    ).toHaveLength(1);
  });

  it('after a refusal the person may ask again', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    const id = await pending(t);
    await as.mutation(api.cercle.reviewRequest, {
      requestId: id,
      decision: 'rejected',
    });
    expect(await pending(t)).not.toBe(id);
  });

  it('the stored request exposes no more than the president needs', async () => {
    const t = newConvexTest();
    const { as } = await admin(t);
    await pending(t);
    const page = await as.query(api.cercle.listRequests, {
      status: 'pending',
      paginationOpts: { numItems: 5, cursor: null },
    });
    const keys = Object.keys(page.page[0]);
    // No storage identifier leaves the server: a CV is opened through `openCv`.
    expect(keys).not.toContain('cvStorageId');
  });
});

describe('Cercle request — e-mails', () => {
  it('exist in every language and never echo what the person typed', () => {
    for (const locale of SITE_LOCALES) {
      const received = cercleRequestReceivedEmail({
        siteUrl: 'https://x.test',
        locale,
      });
      const approved = cercleApprovedEmail({
        siteUrl: 'https://x.test',
        locale,
      });
      const declined = cercleDeclinedEmail({
        siteUrl: 'https://x.test',
        locale,
      });
      for (const mail of [received, approved, declined]) {
        expect(mail.subject.length).toBeGreaterThan(5);
        expect(mail.html).toContain('<');
      }
      expect(approved.html).toContain(`https://x.test/${locale}/connexion-otp`);
    }
  });
});
