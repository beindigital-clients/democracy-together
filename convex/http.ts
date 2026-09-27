import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { unsubscribeOneClick, unsubscribeRedirect } from './newsletterHttp';

const http = httpRouter();

// Monte les routes HTTP de Convex Auth (callbacks, tokens).
auth.addHttpRoutes(http);

// Newsletter — désinscription en un clic (RFC 8058), cible de l'en-tête
// `List-Unsubscribe` des campagnes (convex/newsletterHttp.ts).
http.route({
  path: '/newsletter/unsubscribe',
  method: 'POST',
  handler: unsubscribeOneClick,
});
http.route({
  path: '/newsletter/unsubscribe',
  method: 'GET',
  handler: unsubscribeRedirect,
});

export default http;
