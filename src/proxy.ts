import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from '@convex-dev/auth/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { isProtectedPath, signInPathFor } from './lib/protected-routes';

const intlMiddleware = createMiddleware(routing);

// Convex Auth gère la route /api/auth (échange de jeton -> cookie httpOnly) et,
// pour les autres chemins, délègue le routage de langue à next-intl.
//
// Gating serveur (audit § 5.1) : les zones privées sont désormais refusées ICI,
// avant tout rendu. Auparavant, /admin/* et consorts renvoyaient un HTML 200
// avec « Chargement… » puis redirigeaient en JavaScript au bout de 1,2 seconde
// — donc aucune frontière HTTP, une page blanche sans JS, et un clignotement.
//
// Le middleware ne tranche que « connecté ou non ». Le contrôle de RÔLE reste
// côté Convex (`requireNetworkRole`) : c'est la seule barrière qui compte pour
// les données, et elle ne doit pas être dupliquée ici où elle dériverait.
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

  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // pages : tout sauf api, assets Next, le Studio Sanity et les fichiers
    '/((?!api|_next|_vercel|studio|.*\\..*).*)',
    // route d'auth Convex (doit passer par le middleware, sinon 404)
    '/api/auth',
  ],
};
