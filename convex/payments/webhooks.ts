import { v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from '../_generated/server';
import {
  applyCheckoutClosed,
  applyPaymentSucceeded,
  applyRefundEvent,
  applySubscriptionCancelled,
  applySubscriptionStarted,
} from '../lib/payments/ledger';
import { getAdapter } from '../lib/payments/registry';
import { isProviderEnabled } from '../lib/payments/config';
import type { HeaderReader } from '../lib/payments/types';
import {
  normalizedEventValidator,
  providerIdValidator,
  type NormalizedEvent,
  type ProviderId,
} from '../lib/payments/validators';

// POINT D'ENTRÉE DES WEBHOOKS — commun aux trois prestataires.
//
// `processWebhook` est appelée par les routes HTTP (convex/http.ts) avec le
// corps BRUT : la signature Stripe porte sur les octets reçus, un corps
// re-sérialisé ne la vérifierait plus. L'adaptateur authentifie, puis traduit
// en événements normalisés ; la mutation `applyEvents` les inscrit au grand
// livre en une transaction.
//
// Réponses HTTP : 400 pour une requête non authentifiée (le prestataire ne
// doit pas la rejouer), 404 pour un prestataire non configuré, 500 si
// l'inscription échoue (le prestataire REJOUERA : c'est voulu, l'inscription
// est idempotente), 200 sinon — y compris pour un événement ignoré.

export type WebhookOutcome = { status: number; body: string };

export async function processWebhook(
  ctx: Pick<ActionCtx, 'runMutation'>,
  provider: ProviderId,
  rawBody: string,
  header: HeaderReader,
): Promise<WebhookOutcome> {
  if (!isProviderEnabled(provider)) {
    return { status: 404, body: 'provider not configured' };
  }
  let parsed;
  try {
    parsed = await getAdapter(provider).parseWebhook(rawBody, header);
  } catch (err) {
    // Vérification impossible pour une raison passagère (prestataire
    // injoignable) : 500, pour que le webhook soit renvoyé plus tard.
    console.error(
      `[payments] webhook ${provider} : vérification impossible`,
      err,
    );
    return { status: 500, body: 'verification unavailable' };
  }
  if (!parsed.ok) {
    console.warn(`[payments] webhook ${provider} refusé : ${parsed.reason}`);
    return { status: 400, body: 'invalid webhook' };
  }
  try {
    await ctx.runMutation(internal.payments.webhooks.applyEvents, {
      provider,
      eventId: parsed.eventId,
      type: parsed.type,
      events: parsed.events,
    });
  } catch (err) {
    console.error(`[payments] webhook ${provider} : inscription échouée`, err);
    return { status: 500, body: 'processing failed' };
  }
  return { status: 200, body: 'ok' };
}

const applyResultValidator = v.array(v.string());

// Inscrit les événements d'UN webhook, en une transaction. Le filet d'événement
// (`paymentWebhookEvents`) arrête un rejeu à l'entrée ; le filet décisif reste
// l'index d'idempotence des transactions, qui tient même si deux événements
// DIFFÉRENTS décrivent le même paiement.
export const applyEvents = internalMutation({
  args: {
    provider: providerIdValidator,
    eventId: v.string(),
    type: v.string(),
    events: v.array(normalizedEventValidator),
  },
  returns: applyResultValidator,
  handler: async (ctx, { provider, eventId, type, events }) => {
    const seen = await ctx.db
      .query('paymentWebhookEvents')
      .withIndex('by_provider_and_event', (q) =>
        q.eq('provider', provider).eq('eventId', eventId),
      )
      .first();
    if (seen) return ['duplicate_event'];
    await ctx.db.insert('paymentWebhookEvents', {
      provider,
      eventId,
      type,
      receivedAt: Date.now(),
    });
    return await applyNormalizedEvents(ctx, provider, events);
  },
});

async function applyNormalizedEvents(
  ctx: Parameters<typeof applyPaymentSucceeded>[0],
  provider: ProviderId,
  events: NormalizedEvent[],
): Promise<string[]> {
  const out: string[] = [];
  for (const evt of events) {
    switch (evt.kind) {
      case 'payment_succeeded':
        out.push((await applyPaymentSucceeded(ctx, provider, evt)).status);
        break;
      case 'checkout_closed':
        await applyCheckoutClosed(ctx, provider, evt);
        out.push('closed');
        break;
      case 'subscription_started':
        await applySubscriptionStarted(ctx, provider, evt);
        out.push('subscription_started');
        break;
      case 'subscription_cancelled':
        await applySubscriptionCancelled(ctx, provider, evt);
        out.push('subscription_cancelled');
        break;
      case 'refunded':
        await applyRefundEvent(ctx, provider, evt);
        out.push('refunded');
        break;
    }
  }
  return out;
}

// Même inscription SANS filet d'événement : pour la relecture d'un paiement
// chez le prestataire (retour de paiement, webhook manqué), qui n'a pas
// d'identifiant d'événement. L'idempotence des transactions suffit.
export const applySyncedEvents = internalMutation({
  args: {
    provider: providerIdValidator,
    events: v.array(normalizedEventValidator),
  },
  returns: applyResultValidator,
  handler: async (ctx, { provider, events }) =>
    await applyNormalizedEvents(ctx, provider, events),
});

// Variante appelable d'une action (et des tests) : même chemin que la route
// HTTP, sans le saut réseau.
export const handleWebhook = internalAction({
  args: {
    provider: providerIdValidator,
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  returns: v.object({ status: v.number(), body: v.string() }),
  handler: async (ctx, { provider, rawBody, headers }) => {
    const lower = new Map(
      Object.entries(headers).map(([k, val]) => [k.toLowerCase(), val]),
    );
    return await processWebhook(
      ctx,
      provider,
      rawBody,
      (name) => lower.get(name.toLowerCase()) ?? null,
    );
  },
});
