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

// WEBHOOK ENTRY POINT — shared by the three providers.
//
// `processWebhook` is called by the HTTP routes (convex/http.ts) with the
// RAW body: the Stripe signature covers the bytes received, a
// re-serialized body would no longer verify it. The adapter authenticates, then translates
// into normalized events; the `applyEvents` mutation records them in the
// ledger in one transaction.
//
// HTTP responses: 400 for an unauthenticated request (the provider must not
// replay it), 404 for an unconfigured provider, 500 if
// recording fails (the provider WILL REPLAY: this is intended, recording
// is idempotent), 200 otherwise — including for an ignored event.

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
    // Verification impossible for a transient reason (provider
    // unreachable): 500, so the webhook is resent later.
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

// Records the events of ONE webhook, in one transaction. The event net
// (`paymentWebhookEvents`) stops a replay at the entrance; the decisive net remains
// the transactions' idempotency index, which holds even if two
// DIFFERENT events describe the same payment.
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

// Same recording WITHOUT the event net: for re-reading a payment
// from the provider (payment return, missed webhook), which has no
// event id. Transaction idempotency is enough.
export const applySyncedEvents = internalMutation({
  args: {
    provider: providerIdValidator,
    events: v.array(normalizedEventValidator),
  },
  returns: applyResultValidator,
  handler: async (ctx, { provider, events }) =>
    await applyNormalizedEvents(ctx, provider, events),
});

// Variant callable from an action (and from tests): same path as the HTTP
// route, without the network hop.
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
