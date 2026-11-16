import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { checkFileContent } from './lib/fileCheck';
import { CV_CONTENT_TYPE, CV_MAX_BYTES } from './lib/cercle';
import { SITE_LOCALES, type SiteLocale } from './lib/locales';
import { siteUrl } from './lib/newsletterContent';

// ANONYMOUS CV UPLOAD (Cercle des Amis, convex/cercle.ts).
//
// A person asking to join has no account, so the upload is open — which is why
// the file does not go straight to Convex storage through an upload URL: that
// would let anyone park any file of any size in our storage. The browser posts
// here instead, and the file is stored only if:
//   1. the per-IP and global caps allow it (`reserveUpload`, checked BEFORE
//      the body is read);
//   2. it is not larger than `CV_MAX_BYTES`;
//   3. its first bytes are a PDF's (`%PDF-`), whatever the announced type says.
// The stored id is recorded in `cercleUploads`: only such an id can be attached
// to a request, and an id nobody attaches is deleted after a day.
//
// Separate from `http.ts` (which mounts Convex Auth and is not loaded by the
// tests): this module is exercised through a test router.

// No cookie and no credential travel with this request, so any origin may call
// it: the caps above are what protect it, not the origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export const cvUploadPreflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS });
});

export const cvUpload = httpAction(async (ctx, req) => {
  // Declared size first: a refusal that costs nothing.
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > CV_MAX_BYTES) {
    return reply(413, { error: 'INVALID_FILE' });
  }

  try {
    await ctx.runMutation(internal.cercle.reserveUpload, {});
  } catch {
    // `RATE_LIMITED` is a ConvexError: the endpoint only says "too many".
    return reply(429, { error: 'RATE_LIMITED' });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > CV_MAX_BYTES) {
    return reply(413, { error: 'INVALID_FILE' });
  }
  const verdict = checkFileContent('cv.pdf', bytes);
  if (!verdict.ok) return reply(415, { error: 'FILE_CONTENT_MISMATCH' });

  const storageId = await ctx.storage.store(
    new Blob([bytes], { type: CV_CONTENT_TYPE }),
  );
  await ctx.runMutation(internal.cercle.recordUpload, { storageId });
  return reply(200, { storageId });
});

// --- One-click unsubscribe of the Cercle's mailing list (RFC 8058) -----------------
//
// Target of the `List-Unsubscribe` header of every Cercle message. Same two
// uses as the newsletter's (convex/newsletterHttp.ts): a POST
// `List-Unsubscribe=One-Click` unsubscribes with no further step; a GET — a
// mail client opening the link, or an antivirus prefetching it — must NOT
// unsubscribe, it redirects to the page where the person does it knowingly.

function langOf(raw: string | null): SiteLocale {
  return (SITE_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as SiteLocale)
    : 'fr';
}

function tokenOf(url: URL): string {
  const token = url.searchParams.get('token') ?? '';
  return /^[0-9a-f]{32}$/.test(token) ? token : '';
}

export const unsubscribeOneClick = httpAction(async (ctx, req) => {
  const token = tokenOf(new URL(req.url));
  if (!token) return new Response('Bad Request', { status: 400 });
  const result = await ctx.runMutation(
    internal.cercleMailing.unsubscribeByToken,
    { token },
  );
  return new Response(result.ok ? 'OK' : 'Bad Request', {
    status: result.ok ? 200 : 400,
  });
});

export const unsubscribeRedirect = httpAction(async (_ctx, req) => {
  const url = new URL(req.url);
  const token = tokenOf(url);
  const loc = langOf(url.searchParams.get('l'));
  const target = `${siteUrl()}/${loc}/cercle/desinscription${
    token ? `?token=${token}` : ''
  }`;
  return new Response(null, { status: 302, headers: { Location: target } });
});
