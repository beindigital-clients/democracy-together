import { test, expect } from '@playwright/test';
import { PROTECTED_SEGMENTS } from '../../src/lib/protected-routes';
import { SESSIONS } from './_sessions';

// Middleware wiring (src/proxy.ts) — issue #42, item 5.
//
// The decision functions (`isProtectedPath`, `signInPathFor`) are covered
// by tests/unit/protected-routes.test.ts. What nothing covered was the
// WIRING: the call to `convexAuth.isAuthenticated()` and the redirect. It
// requires a real Convex deployment, hence an E2E — unblocked since every
// pull request gets its preview (issue #43, .github/workflows/e2e.yml).
//
// WHY `request.get(..., { maxRedirects: 0 })` AND NOT `page.goto`.
// That is the whole point. The two existing specs (auth-protected.spec.ts) do
// `page.goto` then check the final URL — yet the old behavior, the one that
// PR #4 removed (audit § 5.1), would pass them too: the page returned an
// HTML 200 "Chargement…" and redirected IN JAVASCRIPT after 1.2 seconds.
// Same final URL, but no HTTP boundary, a blank page without JS, and a
// flicker. Only a request that DOES NOT FOLLOW redirects tells
// the two apart: here we require a 3xx from the server, before any render.
//
// The ROLE check is not the subject: the middleware only decides
// "signed in or not" (that stays on the Convex side, see convex/lib/rbac.ts).

const PRIVEES = [
  '/fr/admin',
  '/fr/admin/utilisateurs',
  '/fr/espace-membre',
  '/fr/espaces',
  '/fr/notifications',
  '/en/admin',
  '/en/espace-membre',
  '/en/espaces',
  '/en/notifications',
  // Without a language prefix: the middleware runs BEFORE next-intl's language
  // redirect, so the guard must bite here too.
  '/admin',
  '/espace-membre',
];

// Public control pages. They are chosen among those that
// READ NOTHING from Convex: the library or the directory would make a
// MIDDLEWARE spec depend on the dataset's state, and thus fail for a reason
// unrelated to its subject. `/connexion` is included on purpose — it is the
// redirect target, and keeping it public is what prevents the loop.
const PUBLIQUES = [
  '/fr',
  '/en',
  '/fr/adhesion',
  '/en/adhesion',
  '/fr/connexion',
  '/en/connexion',
  '/fr/mentions-legales',
  '/en/mentions-legales',
];

// Paths that START like a protected segment without being one. They have
// no page (404 expected) — and that is exactly what makes them useful: a
// guard comparing string prefixes instead of whole segments would
// send them to /connexion. The 404 says the middleware let them
// through to the application.
const SOSIES = [
  '/fr/administration',
  '/fr/espaces-verts',
  '/fr/notifications-publiques',
];

function estRedirection(status: number) {
  return status >= 300 && status < 400;
}

test.describe('Gating serveur — visiteur non connecté', () => {
  // The array above is hard-coded (concrete URLs, not patterns):
  // this test must exercise REAL routes. But it must not miss
  // a segment added later to the application's list either — hence this safeguard.
  test('les URL exercées couvrent tous les segments protégés', () => {
    for (const segment of PROTECTED_SEGMENTS) {
      expect(
        PRIVEES.some((url) => url.split('/')[2] === segment),
        `aucune URL ne couvre le segment « ${segment} »`,
      ).toBe(true);
    }
  });

  for (const url of PRIVEES) {
    test(`${url} : redirigée par le SERVEUR, avant tout rendu`, async ({
      request,
    }) => {
      const res = await request.get(url, { maxRedirects: 0 });

      expect(
        estRedirection(res.status()),
        `${url} a répondu ${res.status()} au lieu d'une redirection`,
      ).toBe(true);
      expect(res.headers()['location']).toContain('/connexion');
    });
  }

  // The requested language is preserved: sending an English speaker to
  // /fr/connexion would be an unsolicited language change.
  test('la redirection garde la langue de la page demandée', async ({
    request,
  }) => {
    const fr = await request.get('/fr/admin', { maxRedirects: 0 });
    expect(fr.headers()['location']).toContain('/fr/connexion');

    const en = await request.get('/en/admin', { maxRedirects: 0 });
    expect(en.headers()['location']).toContain('/en/connexion');
  });

  // Control: the guard must not spill over onto the public site, otherwise
  // it would lock the entire platform without anything saying so.
  for (const url of PUBLIQUES) {
    test(`${url} : publique, servie sans détour par la connexion`, async ({
      request,
    }) => {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  // Convex Auth's token-exchange route goes through the middleware (it
  // is in `config.matcher`) but must come out of it untouched: the handler returns
  // before any guard for `/api`. Forgetting that has already broken all of
  // authentication once — TESTING.md lists it among the bugs caught.
  //
  // The STATUS belongs to the Convex Auth route, not to the middleware: a bare GET
  // is not what it expects, and pinning it here would make this spec fail at the
  // library's first change. What is checked is what the
  // middleware is answerable for — not having diverted it.
  for (const url of SOSIES) {
    test(`${url} : ressemble à une zone privée sans en être une`, async ({
      request,
    }) => {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.headers()['location'] ?? '').not.toContain('/connexion');
    });
  }

  test('/api/auth atteint bien l’échange de jeton', async ({ request }) => {
    const res = await request.get('/api/auth', { maxRedirects: 0 });
    const location = res.headers()['location'] ?? '';

    expect(location).not.toContain('/connexion');
    expect(location).not.toMatch(/\/(fr|en)\/api/);
    // THE 404 IS THE SIGNAL. This route does not exist as a file: it is
    // served by the middleware, to which `config.matcher` must explicitly
    // hand it (`convexAuthNextjsMiddleware` then recognizes it and relays to
    // Convex). Removing this entry from the matcher makes all of authentication
    // answer 404 — it happened, TESTING.md counts it among the bugs
    // caught, and the rest of the gating keeps working in the
    // meantime, so no other test in this file would see it.
    //
    // Verified by removing the entry on a production build: the response
    // goes from 405 to 404, and this test alone fails. We do not pin 405: the
    // status of a bare GET belongs to Convex Auth, not to the middleware.
    expect(res.status()).not.toBe(404);
  });
});

// THE control of this file. Without it, a middleware that redirected
// EVERYONE — signed-in users included — would pass each of the tests above: they only
// check the refusal. This block checks that the door opens, hence that
// `convexAuth.isAuthenticated()` is actually consulted and read.
//
// "ÉDITEUR" SESSION, and this choice is not arbitrary: `_sessions.ts` sets
// the rule that an account shared by two files has its session die (two
// contexts present the same refresh token, Convex Auth sees it as a
// replay). `admin` already carries `admin.spec` and `admin-ecrans`; adding to it would
// make this the THIRD file — exactly the count that issue #38 saw
// fail. `editeur` is provisioned by the `setup` project and is used
// by no spec: this file is its only client, hence no overlap.
//
// The role is irrelevant here anyway: the middleware only decides
// "signed in or not".
test.describe('Gating serveur — compte connecté', () => {
  test.use({ storageState: SESSIONS.editeur.state });

  // Routes open to any signed-in account: the response is the PAGE.
  for (const url of ['/fr/espace-membre', '/fr/notifications']) {
    test(`${url} : servie (200), sans détour par la connexion`, async ({
      page,
    }) => {
      // `page.request` shares the context's cookie jar: it is the session
      // opened by the `setup` project that is presented, as in a real
      // browser.
      const res = await page.request.get(url, { maxRedirects: 0 });

      expect(
        res.status(),
        `${url} a répondu ${res.status()} : ${res.headers()['location'] ?? ''}`,
      ).toBe(200);
    });
  }

  // /admin with an EDITOR account — and that is the point. The middleware does not
  // know about roles: it opens the HTTP door as soon as the visitor is
  // signed in, and it is Convex that then refuses the data (`requireNetworkRole`).
  // So we check that there is no redirect to sign-in, not the page
  // body: that body belongs to the role check, which is not this file.
  test('/fr/admin : un compte connecté non-admin n’est pas renvoyé à la connexion', async ({
    page,
  }) => {
    const res = await page.request.get('/fr/admin', { maxRedirects: 0 });
    expect(res.headers()['location'] ?? '').not.toContain('/connexion');
  });
});
