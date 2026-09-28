import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { auth } from './auth';
import { processWebhook } from './payments/webhooks';
import type { ProviderId } from './lib/payments/validators';
import { unsubscribeOneClick, unsubscribeRedirect } from './newsletterHttp';

const http = httpRouter();

// Mounts the Convex Auth HTTP routes (callbacks, tokens).
auth.addHttpRoutes(http);

// Payment provider webhooks (F-27/F-28) — to be declared with each one
// using the address `<CONVEX_SITE_URL>/payments/webhook/<prestataire>`
// (docs/backlog/paiements.md). The body is read as RAW TEXT: the signature
// covers the received bytes. The logic lives in convex/payments/webhooks.ts
// — tested without this file, which convex-test does not load.
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

for (const provider of ['stripe', 'fake'] as const) {
  http.route({
    path: `/payments/webhook/${provider}`,
    method: 'POST',
    handler: webhookRoute(provider),
  });
}
// Newsletter — one-click unsubscribe (RFC 8058), target of the campaigns'
// `List-Unsubscribe` header (convex/newsletterHttp.ts).
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
