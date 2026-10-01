import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from '@convex-dev/auth/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { isProtectedPath, signInPathFor } from './lib/protected-routes';
import { notFoundRewriteFor } from './lib/not-found-routes';

const intlMiddleware = createMiddleware(routing);

// Convex Auth handles the /api/auth route (token exchange -> httpOnly cookie) and,
// for other paths, delegates locale routing to next-intl.
//
// Server-side gating (audit § 5.1): private areas are now refused HERE,
// before any rendering. Previously, /admin/* and the like returned a 200 HTML
// page with "Chargement…" and then redirected in JavaScript after 1.2 seconds
// — hence no HTTP boundary, a blank page without JS, and a flash.
//
// The middleware only decides "signed in or not". The ROLE check stays on
// the Convex side (`requireNetworkRole`): it is the only barrier that matters
// for the data, and it must not be duplicated here where it would drift.
//
// 404 IN THE VISITOR'S LANGUAGE (R-04, client decision of 23/09 item 4):
// an unknown first segment under a locale prefix (`/ar/xyz`) — or an
// empty slug (`/fr/le-reseau/%00`, showcase O4) — is REWRITTEN to the
// `/<locale>/introuvable` page with a 404 status. The page is rendered in the
// locale layout (header, footer, `lang`/`dir`), hence readable without
// JavaScript — which a `notFound()` does not give on Next 16.3.5 (measured,
// see src/app/not-found.tsx). A path WITHOUT prefix (`/xx`, `/de`) is first
// redirected by next-intl to `/<detected locale>/xx`, and it is that
// second request which gets the 404 — in the visitor's language. The list
// of known segments lives in src/lib/not-found-routes.ts, tested against the
// actual folders.
export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (request.nextUrl.pathname.startsWith('/api')) return;

  if (
    isProtectedPath(request.nextUrl.pathname) &&
    !(await convexAuth.isAuthenticated())
  ) {
    return nextjsMiddlewareRedirect(
      request,
      signInPathFor(request.nextUrl.pathname),
    );
  }

  const response = intlMiddleware(request);
  const target = notFoundRewriteFor(request.nextUrl.pathname);
  // A next-intl redirect (`/FR` -> `/fr`) takes precedence: the next
  // request will be judged in its turn.
  if (!target || response.headers.has('location')) return response;

  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = '';
  const notFound = NextResponse.rewrite(url, { status: 404 });
  // We keep what next-intl set on its response — the request headers
  // carrying the locale (`x-middleware-request-*`) and the locale cookie —
  // so that the rewritten page is rendered exactly like a normal page.
  response.headers.forEach((value, key) => {
    if (key !== 'x-middleware-next' && key !== 'x-middleware-rewrite') {
      notFound.headers.set(key, value);
    }
  });
  return notFound;
});

export const config = {
  matcher: [
    // pages: everything except api, Next assets and files
    '/((?!api|_next|_vercel|.*\\..*).*)',
    // Convex auth route (must go through the middleware, otherwise 404)
    '/api/auth',
  ],
};
