// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { httpRouter } from 'convex/server';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { cvUpload, cvUploadPreflight } from './cercleHttp';
import { CV_MAX_BYTES } from './lib/cercle';
import { UNCLAIMED_UPLOAD_TTL_MS } from './cercle';

// CERCLE DES AMIS — ANONYMOUS CV UPLOAD (convex/cercleHttp.ts).
//
// `http.ts` mounts Convex Auth and is not loaded by the tests, so the route is
// mounted on a router of its own, built here from the very handlers
// `http.ts` mounts.

const router = httpRouter();
router.route({ path: '/cercle/cv', method: 'POST', handler: cvUpload });
router.route({
  path: '/cercle/cv',
  method: 'OPTIONS',
  handler: cvUploadPreflight,
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

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 fictitious cv');

function post(
  t: T,
  body: BodyInit | null,
  headers: Record<string, string> = {},
) {
  return t.fetch('/cercle/cv', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/pdf', ...headers },
  });
}

async function storedBlobs(t: T) {
  return await t.run((ctx) => ctx.db.system.query('_storage').collect());
}

describe('Cercle CV upload endpoint', () => {
  it('stores a PDF, records the upload and answers with its id', async () => {
    const t = newConvexTest();
    const res = await post(t, PDF_BYTES);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
    expect(await storedBlobs(t)).toHaveLength(1);
    const rows = await t.run((ctx) => ctx.db.query('cercleUploads').collect());
    expect(rows.map((r) => r.storageId)).toEqual([storageId]);
  });

  it('refuses a file that is not a PDF, whatever type it announces, and stores nothing', async () => {
    const t = newConvexTest();
    const res = await post(t, new TextEncoder().encode('MZ not a pdf at all'));
    expect(res.status).toBe(415);
    expect(await storedBlobs(t)).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query('cercleUploads').collect()),
    ).toHaveLength(0);
  });

  it('refuses an empty body and an oversized one, by declaration and by size', async () => {
    const t = newConvexTest();
    expect((await post(t, new Uint8Array())).status).toBe(413);
    expect(
      (await post(t, PDF_BYTES, { 'Content-Length': String(CV_MAX_BYTES + 1) }))
        .status,
    ).toBe(413);
    const big = new Uint8Array(CV_MAX_BYTES + 1);
    big.set(new TextEncoder().encode('%PDF-'));
    expect((await post(t, big)).status).toBe(413);
    expect(await storedBlobs(t)).toHaveLength(0);
  });

  it('answers the CORS preflight', async () => {
    const t = newConvexTest();
    const res = await t.fetch('/cercle/cv', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('is capped: past the global cap, the answer is 429 and nothing more is stored', async () => {
    const t = newConvexTest();
    let last = 200;
    let ok = 0;
    for (let i = 0; i < 305; i++) {
      last = (await post(t, PDF_BYTES)).status;
      if (last === 200) ok++;
    }
    expect(ok).toBe(300);
    expect(last).toBe(429);
    expect(await storedBlobs(t)).toHaveLength(300);
  });
});

describe('Cercle CV upload — attaching to a request', () => {
  function requestArgs(cvStorageId: Id<'_storage'>, email: string) {
    return {
      name: 'Alex Fictif',
      email,
      cvStorageId,
      cvFileName: 'cv.pdf',
      acceptCharter: true as const,
      acceptNotice: true as const,
    };
  }
  async function upload(t: T) {
    const res = await post(t, PDF_BYTES);
    return ((await res.json()) as { storageId: Id<'_storage'> }).storageId;
  }

  it('accepts an uploaded CV, once', async () => {
    const t = newConvexTest();
    const cv = await upload(t);
    await t.action(api.cercle.submitRequest, requestArgs(cv, 'a@example.test'));
    // The upload row is spent: the same CV cannot back a second request.
    expect(
      await t.run((ctx) => ctx.db.query('cercleUploads').collect()),
    ).toHaveLength(0);
    await expect(
      t.action(api.cercle.submitRequest, requestArgs(cv, 'b@example.test')),
    ).rejects.toThrow(/INVALID_FILE/);
  });

  it('refuses a stored file that did not come through the endpoint', async () => {
    const t = newConvexTest();
    const stray = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(['%PDF-1.4 sneaky'], { type: 'application/pdf' }),
      ),
    );
    await expect(
      t.action(api.cercle.submitRequest, requestArgs(stray, 'a@example.test')),
    ).rejects.toThrow(/INVALID_FILE/);
    expect(
      await t.run((ctx) => ctx.db.query('cercleRequests').collect()),
    ).toHaveLength(0);
  });
});

describe('Cercle CV upload — cleaning up what nobody claimed', () => {
  it('deletes the blob and the row of a CV left unclaimed for a day, and only those', async () => {
    const t = newConvexTest();
    const stale = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(['%PDF-1.4 old']));
      await ctx.db.insert('cercleUploads', {
        storageId,
        createdAt: Date.now() - UNCLAIMED_UPLOAD_TTL_MS - 1000,
      });
      return storageId;
    });
    const fresh = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(['%PDF-1.4 new']));
      await ctx.db.insert('cercleUploads', {
        storageId,
        createdAt: Date.now(),
      });
      return storageId;
    });
    await t.mutation(internal.cercle.purgeUnclaimedUploads, {});
    expect(await t.run((ctx) => ctx.db.system.get(stale))).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(fresh))).not.toBeNull();
    const rows = await t.run((ctx) => ctx.db.query('cercleUploads').collect());
    expect(rows.map((r) => r.storageId)).toEqual([fresh]);
  });
});
