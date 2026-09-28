import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { SITE_LOCALES, type SiteLocale } from './lib/locales';
import { siteUrl } from './lib/newsletterContent';

// "ONE-CLICK" UNSUBSCRIBE (RFC 8058) — target of the
// `List-Unsubscribe` header of each campaign (diffusion workstream, F-65).
//
// Two uses, one address:
//  - POST `List-Unsubscribe=One-Click`: the "Unsubscribe" button that
//    Gmail, Yahoo or Apple Mail display above the message. It MUST
//    unsubscribe with no further step or page to visit; it does not follow
//    redirects and displays nothing.
//  - GET: a client opening the link in the browser. We do NOT unsubscribe
//    on a GET — email antivirus software prefetches links, and
//    a mere preview would unsubscribe the subscriber —, we redirect to the
//    unsubscribe page, in the subscriber's language, which performs the same operation
//    in view of the user.
//
// Module separate from `http.ts` (which also mounts Convex Auth and is not loaded
// by the tests): the decision lives in `newsletter.unsubscribeByToken`,
// tested directly.

function langOf(raw: string | null): SiteLocale {
  return (SITE_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as SiteLocale)
    : 'fr';
}

function tokenOf(url: URL): string {
  const token = url.searchParams.get('token') ?? '';
  // Unsubscribe token: 32 hexadecimal characters. Everything else is
  // refused before any database read.
  return /^[0-9a-f]{32}$/.test(token) ? token : '';
}

export const unsubscribeOneClick = httpAction(async (ctx, req) => {
  const token = tokenOf(new URL(req.url));
  if (!token) return new Response('Bad Request', { status: 400 });
  const result = await ctx.runMutation(internal.newsletter.unsubscribeByToken, {
    token,
  });
  // 200 even for an unknown token (already unsubscribed): the email
  // client has nothing else to do, and the response does not distinguish one
  // subscriber from another.
  return new Response(result.ok ? 'OK' : 'Bad Request', {
    status: result.ok ? 200 : 400,
  });
});

export const unsubscribeRedirect = httpAction(async (_ctx, req) => {
  const url = new URL(req.url);
  const token = tokenOf(url);
  const loc = langOf(url.searchParams.get('l'));
  const target = `${siteUrl()}/${loc}/newsletter/desinscription${
    token ? `?token=${token}` : ''
  }`;
  return new Response(null, { status: 302, headers: { Location: target } });
});
