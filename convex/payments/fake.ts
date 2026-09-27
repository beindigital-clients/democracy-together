import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import { action, internalQuery, query } from '../_generated/server';
import { fakeProviderState, returnPath } from '../lib/payments/config';
import { randomToken } from '../lib/payments/crypto';
import {
  FAKE_SIGNATURE_HEADER,
  signFakePayload,
  type FakeWebhookPayload,
} from '../lib/payments/fake';
import { locale, type SiteLocale } from '../lib/locales';
import {
  checkoutStatusValidator,
  currencyValidator,
  paymentPurposeValidator,
} from '../lib/payments/validators';
import { processWebhook } from './webhooks';

// SIMULATEUR DE PAIEMENT — DÉVELOPPEMENT ET E2E UNIQUEMENT.
//
// La page /paiement/simulateur joue le rôle de la page hébergée d'un
// prestataire. « Payer » fabrique un webhook SIGNÉ et le passe à
// `processWebhook`, exactement comme la route HTTP : vérification de
// signature, filet d'événement, grand livre, reçu. Hors garde (production),
// les deux fonctions refusent — la query répond `enabled: false`, l'action
// lève — et la route HTTP factice répond 404.

export const simulatorInfo = query({
  args: { ref: v.string() },
  returns: v.object({
    enabled: v.boolean(),
    checkout: v.union(
      v.null(),
      v.object({
        status: checkoutStatusValidator,
        purpose: paymentPurposeValidator,
        recurring: v.boolean(),
        currency: currencyValidator,
        amountMinor: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { ref }) => {
    if (fakeProviderState() !== 'active')
      return { enabled: false, checkout: null };
    if (ref.length === 0 || ref.length > 64)
      return { enabled: true, checkout: null };
    const c = await ctx.db
      .query('paymentCheckouts')
      .withIndex('by_ref', (q) => q.eq('ref', ref))
      .unique();
    if (!c || c.provider !== 'fake') return { enabled: true, checkout: null };
    return {
      enabled: true,
      checkout: {
        status: c.status,
        purpose: c.purpose,
        recurring: c.recurring,
        currency: c.currency,
        amountMinor: c.amountMinor,
      },
    };
  },
});

export const checkoutForSimulation = internalQuery({
  args: { ref: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ref: v.string(),
      status: checkoutStatusValidator,
      currency: currencyValidator,
      amountMinor: v.number(),
      locale,
    }),
  ),
  handler: async (ctx, { ref }) => {
    const c = await ctx.db
      .query('paymentCheckouts')
      .withIndex('by_ref', (q) => q.eq('ref', ref))
      .unique();
    if (!c || c.provider !== 'fake') return null;
    return {
      ref: c.ref,
      status: c.status,
      currency: c.currency,
      amountMinor: c.amountMinor,
      locale: c.locale,
    };
  },
});

export const simulate = action({
  args: {
    ref: v.string(),
    outcome: v.union(v.literal('paid'), v.literal('cancelled')),
  },
  returns: v.object({ returnPath: v.string() }),
  handler: async (ctx, { ref, outcome }): Promise<{ returnPath: string }> => {
    if (fakeProviderState() !== 'active') {
      throw new ConvexError('FAKE_PROVIDER_DISABLED');
    }
    const checkout: {
      ref: string;
      status: string;
      currency: 'EUR' | 'XOF';
      amountMinor: number;
      locale: SiteLocale;
    } | null = await ctx.runQuery(
      internal.payments.fake.checkoutForSimulation,
      { ref },
    );
    if (!checkout) throw new ConvexError('NOT_FOUND');
    if (checkout.status === 'open' || checkout.status === 'created') {
      const payload: FakeWebhookPayload = {
        id: `fakeevt_${randomToken(12)}`,
        type: outcome === 'paid' ? 'payment.succeeded' : 'payment.cancelled',
        ref,
        paymentId: `fakepay_${randomToken(12)}`,
        amountMinor: checkout.amountMinor,
        currency: checkout.currency,
        paidAt: Date.now(),
      };
      const rawBody = JSON.stringify(payload);
      const signature = await signFakePayload(rawBody);
      const result = await processWebhook(ctx, 'fake', rawBody, (name) =>
        name.toLowerCase() === FAKE_SIGNATURE_HEADER ? signature : null,
      );
      if (result.status !== 200) throw new ConvexError('SIMULATION_FAILED');
    }
    return {
      returnPath: returnPath(
        checkout.locale,
        ref,
        outcome === 'paid' ? 'succes' : 'annule',
      ),
    };
  },
});
