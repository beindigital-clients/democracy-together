import { v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { sendEmail } from '../email';
import { providerForCurrency, siteUrl } from '../lib/payments/config';
import { randomToken } from '../lib/payments/crypto';
import { recurringReminderEmail } from '../lib/payments/emails';
import {
  currencyValidator,
  providerIdValidator,
} from '../lib/payments/validators';
import { openCheckout, type CreatedCheckout } from './checkout';

// DON MENSUEL PAR RELANCE (F-28) — pour les prestataires qui ne prélèvent pas
// eux-mêmes. Stripe prélève (abonnement natif) ; ce chemin sert aujourd'hui au
// prestataire factice, et servirait à un prestataire de mobile money, qui
// n'autorise pas de débit récurrent sans action du payeur.
//
// Chaque jour, pour chaque engagement actif dont l'échéance est passée : une
// nouvelle demande de paiement est ouverte chez le prestataire et son lien est
// envoyé par courriel. Réglée, elle avance l'échéance d'un mois (grand livre).
// Restée sans suite, elle est renvoyée au plus tous les RESEND_AFTER jours ;
// après MAX_REMINDERS relances, l'engagement passe « en souffrance » et
// n'est plus relancé — un donateur qui ne répond plus n'est pas harcelé.

const DAY = 24 * 60 * 60 * 1000;
export const RESEND_AFTER = 7 * DAY;
export const MAX_REMINDERS = 3;
const BATCH = 50;

export const dueReminders = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.id('paymentSubscriptions')),
  handler: async (ctx, { now }) => {
    const due = await ctx.db
      .query('paymentSubscriptions')
      .withIndex('by_status_and_nextDueAt', (q) =>
        q.eq('status', 'active').lte('nextDueAt', now),
      )
      .take(BATCH * 4);
    return due
      .filter(
        (s) =>
          s.mode === 'reminder' &&
          (s.lastReminderAt === undefined ||
            now - s.lastReminderAt >= RESEND_AFTER),
      )
      .slice(0, BATCH)
      .map((s) => s._id);
  },
});

// Prépare la relance d'UN engagement : suspend s'il a épuisé ses relances,
// sinon crée la demande de paiement et note la relance — dans la même
// transaction, pour qu'un cron rejoué ne relance pas deux fois.
export const prepareReminder = internalMutation({
  args: { subscriptionId: v.id('paymentSubscriptions'), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      checkoutId: v.id('paymentCheckouts'),
      ref: v.string(),
      provider: providerIdValidator,
    }),
  ),
  handler: async (ctx, { subscriptionId, now }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.status !== 'active' || sub.mode !== 'reminder') return null;
    if (sub.nextDueAt > now) return null;
    if (
      sub.lastReminderAt !== undefined &&
      now - sub.lastReminderAt < RESEND_AFTER
    ) {
      return null;
    }
    if (sub.reminderCount >= MAX_REMINDERS) {
      await ctx.db.patch(sub._id, { status: 'past_due' });
      return null;
    }
    // Le prestataire d'origine s'il est toujours là, sinon celui de la devise.
    const provider = providerForCurrency(sub.currency);
    if (!provider) return null;
    const ref = randomToken(16);
    const checkoutId: Id<'paymentCheckouts'> = await ctx.db.insert(
      'paymentCheckouts',
      {
        ref,
        provider,
        purpose: 'donation',
        currency: sub.currency,
        amountMinor: sub.amountMinor,
        recurring: true,
        status: 'created',
        ...(sub.userId ? { userId: sub.userId } : {}),
        email: sub.email,
        ...(sub.name ? { name: sub.name } : {}),
        locale: sub.locale,
        subscriptionId: sub._id,
        createdAt: now,
      },
    );
    await ctx.db.patch(sub._id, {
      reminderCount: sub.reminderCount + 1,
      lastReminderAt: now,
    });
    return { checkoutId, ref, provider };
  },
});

export const reminderTarget = internalQuery({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      name: v.union(v.string(), v.null()),
      locale: v.union(
        v.literal('fr'),
        v.literal('en'),
        v.literal('es'),
        v.literal('pt'),
        v.literal('ar'),
      ),
      currency: currencyValidator,
      amountMinor: v.number(),
    }),
  ),
  handler: async (ctx, { subscriptionId }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) return null;
    return {
      email: sub.email,
      name: sub.name ?? null,
      locale: sub.locale,
      currency: sub.currency,
      amountMinor: sub.amountMinor,
    };
  },
});

export const sendDueReminders = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const ids: Id<'paymentSubscriptions'>[] = await ctx.runQuery(
      internal.payments.recurring.dueReminders,
      { now },
    );
    let sent = 0;
    for (const subscriptionId of ids) {
      const prepared = await ctx.runMutation(
        internal.payments.recurring.prepareReminder,
        {
          subscriptionId,
          now,
        },
      );
      if (!prepared) continue;
      const target = await ctx.runQuery(
        internal.payments.recurring.reminderTarget,
        {
          subscriptionId,
        },
      );
      if (!target) continue;
      try {
        const created: CreatedCheckout = {
          checkoutId: prepared.checkoutId,
          ref: prepared.ref,
          provider: prepared.provider,
          purpose: 'donation',
          currency: target.currency,
          amountMinor: target.amountMinor,
          recurring: true,
          email: target.email,
          ...(target.name ? { name: target.name } : {}),
          locale: target.locale,
        };
        const { redirectUrl } = await openCheckout(ctx, created);
        // Le prestataire factice rend une adresse relative au site.
        const payUrl = redirectUrl.startsWith('/')
          ? `${siteUrl()}${redirectUrl}`
          : redirectUrl;
        const { subject, html } = recurringReminderEmail({
          amountMinor: target.amountMinor,
          currency: target.currency,
          payUrl,
          locale: target.locale,
        });
        await sendEmail({ to: target.email, subject, html });
        sent++;
      } catch (err) {
        // La relance est comptée (elle a été tentée) : l'échec d'un envoi ne
        // doit pas faire relancer le même donateur à chaque passage du cron.
        console.error(`[payments] relance ${subscriptionId} non envoyée`, err);
      }
    }
    return sent;
  },
});
