import { convexAuthNextjsMiddleware } from '@convex-dev/auth/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Convex Auth gère la route /api/auth (échange de jeton -> cookie httpOnly) et,
// pour les autres chemins, délègue le routage de langue à next-intl.
export default convexAuthNextjsMiddleware((request) => {
  if (request.nextUrl.pathname.startsWith('/api')) return;
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
