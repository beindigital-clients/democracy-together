import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { auth } from './auth';
import { processWebhook } from './payments/webhooks';
import type { ProviderId } from './lib/payments/validators';
import { unsubscribeOneClick, unsubscribeRedirect } from './newsletterHttp';

const http = httpRouter();

// Monte les routes HTTP de Convex Auth (callbacks, tokens).
auth.addHttpRoutes(http);

// Webhooks des prestataires de paiement (F-27/F-28) — à déclarer chez chacun
// avec l'adresse `<CONVEX_SITE_URL>/payments/webhook/<prestataire>`
// (docs/backlog/paiements.md). Le corps est lu en TEXTE BRUT : la signature
// porte sur les octets reçus. La logique vit dans convex/payments/webhooks.ts
// — testée sans ce fichier, que convex-test ne charge pas.
function webhookRoute(provider: ProviderId) {
  return httpAction(async (ctx, req) => {
    const rawBody = await req.text();
    const outcome = await processWebhook(ctx, provider, rawBody, (name) =>
      req.headers.get(name),
    );
    return new Response(outcome.body, {
      status: outcome.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  });
}

for (const provider of ['stripe', 'paydunya', 'fake'] as const) {
  http.route({
    path: `/payments/webhook/${provider}`,
    method: 'POST',
    handler: webhookRoute(provider),
  });
}
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
