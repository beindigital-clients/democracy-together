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
//
// 404 DANS LA LANGUE DU VISITEUR (R-04, arbitrage client du 23/09 point 4) :
// un premier segment inconnu sous un préfixe de langue (`/ar/xyz`) — ou un
// slug vide (`/fr/le-reseau/%00`, vitrine O4) — est RÉÉCRIT vers la page
// `/<locale>/introuvable` avec le statut 404. La page est rendue dans le
// layout de langue (en-tête, pied de page, `lang`/`dir`), donc lisible sans
// JavaScript — ce qu'un `notFound()` ne donne pas sur Next 16.3.5 (mesuré,
// cf. src/app/not-found.tsx). Un chemin SANS préfixe (`/xx`, `/de`) est
// d'abord redirigé par next-intl vers `/<langue détectée>/xx`, et c'est cette
// seconde requête qui reçoit la 404 — dans la langue du visiteur. La liste
// des segments connus vit dans src/lib/not-found-routes.ts, testée contre les
// dossiers réels.
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
  // Une redirection de next-intl (`/FR` -> `/fr`) passe avant : la requête
  // suivante sera jugée à son tour.
  if (!target || response.headers.has('location')) return response;

  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = '';
  const notFound = NextResponse.rewrite(url, { status: 404 });
  // On garde ce que next-intl a posé sur sa réponse — les en-têtes de requête
  // qui portent la langue (`x-middleware-request-*`) et le cookie de langue —
  // pour que la page réécrite soit rendue exactement comme une page normale.
  response.headers.forEach((value, key) => {
    if (key !== 'x-middleware-next' && key !== 'x-middleware-rewrite') {
      notFound.headers.set(key, value);
    }
  });
  return notFound;
});

export const config = {
  matcher: [
    // pages : tout sauf api, assets Next, le Studio Sanity et les fichiers
    '/((?!api|_next|_vercel|studio|.*\\..*).*)',
    // route d'auth Convex (doit passer par le middleware, sinon 404)
    '/api/auth',
  ],
};
