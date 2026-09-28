import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  action,
  internalMutation,
  query,
  type ActionCtx,
} from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { locale, type SiteLocale } from '../lib/locales';
import { enforceRecaptcha } from '../lib/recaptcha';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from '../lib/rateLimit';
import { getActiveUserId, requireNetworkRole } from '../lib/rbac';
import { FIELD_MAX, isEmail } from '../lib/validation';
import { normalizeEmail } from '../lib/onboarding';
import {
  CURRENCIES,
  isDonationAmountValid,
  toMinor,
  type Currency,
} from '../lib/payments/amounts';
import {
  bankTransferInfo,
  convexSiteUrl,
  fakeProviderState,
  providerForCurrency,
  returnUrl,
} from '../lib/payments/config';
import { randomToken } from '../lib/payments/crypto';
import { getAdapter } from '../lib/payments/registry';
import type { Phrase } from '../lib/emailContent';
import {
  checkoutStatusValidator,
  currencyValidator,
  paymentPurposeValidator,
  planCategoryValidator,
  planZoneValidator,
  providerIdValidator,
  type PaymentPurpose,
  type ProviderId,
} from '../lib/payments/validators';

// PAYMENT REQUESTS (F-27/F-28) — from the form to the provider.
//
// Two steps, because a mutation has no network: an internalMutation
// VALIDATES and records the request (bounds, caps, schedule amount), then
// the action opens the session with the provider and returns the address to
// redirect to. The payment is only recorded on the webhook: the browser's
// return proves nothing.

// Donor's bounded message (F-28: "message du donateur").
const DONATION_MESSAGE_MAX = 500;

// --- What the interface needs to know ----------------------------------------------

export const paymentOptions = query({
  args: {},
  returns: v.object({
    currencies: v.array(
      v.object({
        currency: currencyValidator,
        provider: providerIdValidator,
        recurringMode: v.union(v.literal('native'), v.literal('reminder')),
      }),
    ),
    simulated: v.boolean(),
    bankTransfer: v.union(
      v.object({
        holder: v.string(),
        iban: v.string(),
        bic: v.union(v.string(), v.null()),
        bank: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
  }),
  handler: async () => {
    const currencies = CURRENCIES.flatMap((currency) => {
      const provider = providerForCurrency(currency);
      if (!provider) return [];
      return [
        {
          currency,
          provider,
          recurringMode: getAdapter(provider).nativeSubscriptions
            ? ('native' as const)
            : ('reminder' as const),
        },
      ];
    });
    return {
      currencies,
      simulated: fakeProviderState() === 'active',
      bankTransfer: bankTransferInfo(),
    };
  },
});

// --- Opening with the provider ----------------------------------------------------

const DESCRIPTION: Record<'donation' | 'monthly' | 'dues', Phrase> = {
  donation: {
    fr: 'Don à Democracy Together',
    en: 'Donation to Democracy Together',
    es: 'Donación a Democracy Together',
    pt: 'Donativo à Democracy Together',
    ar: 'تبرّع لـ Democracy Together',
  },
  monthly: {
    fr: 'Don mensuel à Democracy Together',
    en: 'Monthly donation to Democracy Together',
    es: 'Donación mensual a Democracy Together',
    pt: 'Donativo mensal à Democracy Together',
    ar: 'تبرّع شهري لـ Democracy Together',
  },
  dues: {
    fr: 'Cotisation annuelle Democracy Together',
    en: 'Democracy Together annual membership fee',
    es: 'Cuota anual de Democracy Together',
    pt: 'Quota anual Democracy Together',
    ar: 'الاشتراك السنوي في Democracy Together',
  },
};

export type CreatedCheckout = {
  checkoutId: Id<'paymentCheckouts'>;
  ref: string;
  provider: ProviderId;
  purpose: PaymentPurpose;
  currency: Currency;
  amountMinor: number;
  recurring: boolean;
  email: string;
  name?: string;
  locale: SiteLocale;
};

const createdCheckoutValidator = v.object({
  checkoutId: v.id('paymentCheckouts'),
  ref: v.string(),
  provider: providerIdValidator,
  purpose: paymentPurposeValidator,
  currency: currencyValidator,
  amountMinor: v.number(),
  recurring: v.boolean(),
  email: v.string(),
  name: v.optional(v.string()),
  locale,
});

/** Opens the session with the provider. Shared with the reminders. */
export async function openCheckout(
  ctx: Pick<ActionCtx, 'runMutation'>,
  c: CreatedCheckout,
): Promise<{ redirectUrl: string; ref: string }> {
  const adapter = getAdapter(c.provider);
  const kind =
    c.purpose === 'dues' ? 'dues' : c.recurring ? 'monthly' : 'donation';
  try {
    const res = await adapter.createCheckout({
      ref: c.ref,
      purpose: c.purpose,
      currency: c.currency,
      amountMinor: c.amountMinor,
      recurring: c.recurring && adapter.nativeSubscriptions,
      description: DESCRIPTION[kind][c.locale],
      email: c.email,
      ...(c.name ? { name: c.name } : {}),
      locale: c.locale,
      successUrl: returnUrl(c.locale, c.ref, 'succes'),
      cancelUrl: returnUrl(c.locale, c.ref, 'annule'),
      webhookUrl: `${convexSiteUrl()}/payments/webhook/${c.provider}`,
    });
    await ctx.runMutation(internal.payments.checkout.attachSession, {
      checkoutId: c.checkoutId,
      providerSessionId: res.providerSessionId,
    });
    return { redirectUrl: res.redirectUrl, ref: c.ref };
  } catch (err) {
    console.error(
      `[payments] ouverture ${c.provider} échouée pour ${c.ref}`,
      err,
    );
    await ctx.runMutation(internal.payments.checkout.markCheckoutFailed, {
      checkoutId: c.checkoutId,
    });
    throw new ConvexError('PROVIDER_ERROR');
  }
}

export const attachSession = internalMutation({
  args: {
    checkoutId: v.id('paymentCheckouts'),
    providerSessionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { checkoutId, providerSessionId }) => {
    const c = await ctx.db.get(checkoutId);
    if (!c) return null;
    await ctx.db.patch(checkoutId, {
      providerSessionId,
      // A very fast webhook may have completed the request before this return.
      ...(c.status === 'created' ? { status: 'open' as const } : {}),
    });
    return null;
  },
});

export const markCheckoutFailed = internalMutation({
  args: { checkoutId: v.id('paymentCheckouts') },
  returns: v.null(),
  handler: async (ctx, { checkoutId }) => {
    const c = await ctx.db.get(checkoutId);
    if (c && (c.status === 'created' || c.status === 'open')) {
      await ctx.db.patch(checkoutId, { status: 'failed' });
    }
    return null;
  },
});

// --- Donation (F-28) ----------------------------------------------------------------

const donationArgs = {
  currency: currencyValidator,
  // MAJOR units, as entered (20 = €20).
  amount: v.number(),
  recurring: v.boolean(),
  email: v.string(),
  name: v.optional(v.string()),
  anonymous: v.boolean(),
  message: v.optional(v.string()),
  locale,
};

// Public gate: reCAPTCHA (the form is open to visitors), then
// validation and caps in the mutation, then opening with the provider.
export const startDonation = action({
  args: { ...donationArgs, captchaToken: v.optional(v.string()) },
  returns: v.object({ redirectUrl: v.string(), ref: v.string() }),
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'donation');
    const created: CreatedCheckout = await ctx.runMutation(
      internal.payments.checkout.createDonationCheckout,
      input,
    );
    return await openCheckout(ctx, created);
  },
});

export const createDonationCheckout = internalMutation({
  args: donationArgs,
  returns: createdCheckoutValidator,
  handler: async (ctx, args) => {
    const provider = providerForCurrency(args.currency);
    // No provider for this currency: the interface does not offer the
    // button, but the server assumes nothing about the interface.
    if (!provider) throw new ConvexError('PAYMENTS_UNAVAILABLE');

    const amountMinor = toMinor(args.amount, args.currency);
    if (
      amountMinor === null ||
      !isDonationAmountValid(amountMinor, args.currency)
    ) {
      throw new ConvexError('AMOUNT_OUT_OF_BOUNDS');
    }
    const email = normalizeEmail(args.email);
    if (!isEmail(email)) throw new ConvexError('INVALID_EMAIL');
    const name = args.name?.trim() || undefined;
    if (name && name.length > FIELD_MAX.name)
      throw new ConvexError('INVALID_NAME');
    const message = args.message?.trim() || undefined;
    if (message && message.length > DONATION_MESSAGE_MAX) {
      throw new ConvexError('INVALID_MESSAGE');
    }

    // Unforgeable caps (IP, global) THEN per address.
    await enforcePublicFormLimit(ctx, 'donation');
    await enforceRateLimit(ctx, {
      key: `donation:${email}`,
      ...RATE_LIMITS.donation,
    });

    // A suspended account donates like a visitor: nothing is linked to it.
    const userId = await getActiveUserId(ctx);
    const ref = randomToken(16);
    const checkoutId = await ctx.db.insert('paymentCheckouts', {
      ref,
      provider,
      purpose: 'donation',
      currency: args.currency,
      amountMinor,
      recurring: args.recurring,
      status: 'created',
      ...(userId ? { userId } : {}),
      email,
      ...(name ? { name } : {}),
      anonymous: args.anonymous,
      ...(message ? { message } : {}),
      locale: args.locale,
      createdAt: Date.now(),
    });
    return {
      checkoutId,
      ref,
      provider,
      purpose: 'donation' as const,
      currency: args.currency,
      amountMinor,
      recurring: args.recurring,
      email,
      ...(name ? { name } : {}),
      locale: args.locale,
    };
  },
});

// --- Membership fee (F-27) -----------------------------------------------------------

const duesArgs = {
  category: planCategoryValidator,
  zone: planZoneValidator,
  currency: currencyValidator,
  locale,
};

// Reserved for signed-in members: the membership fee is linked to an account (and,
// for a think tank, to its organization). No reCAPTCHA: the caller is
// authenticated, the per-account cap is enough.
export const startDues = action({
  args: duesArgs,
  returns: v.object({ redirectUrl: v.string(), ref: v.string() }),
  handler: async (ctx, input) => {
    const created: CreatedCheckout = await ctx.runMutation(
      internal.payments.checkout.createDuesCheckout,
      input,
    );
    return await openCheckout(ctx, created);
  },
});

export const createDuesCheckout = internalMutation({
  args: duesArgs,
  returns: createdCheckoutValidator,
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    if (!user.email) throw new ConvexError('INVALID_EMAIL');
    const provider = providerForCurrency(args.currency);
    if (!provider) throw new ConvexError('PAYMENTS_UNAVAILABLE');

    // The amount comes from the SCHEDULE, never from the browser.
    const plan = await ctx.db
      .query('paymentPlans')
      .withIndex('by_category_and_zone', (q) =>
        q.eq('category', args.category).eq('zone', args.zone),
      )
      .first();
    const amountMinor =
      args.currency === 'EUR' ? plan?.amountEur : plan?.amountUsd;
    if (!plan || !plan.active || amountMinor === undefined) {
      throw new ConvexError('PLAN_UNAVAILABLE');
    }

    await enforceRateLimit(ctx, {
      key: `dues:${user._id}`,
      ...RATE_LIMITS.dues,
    });

    // Organization membership fee: linked to the organization the account
    // represents (owner), for back-office tracking.
    let orgId: Id<'organizations'> | undefined;
    if (args.category === 'org') {
      const memberships = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .take(20);
      orgId = memberships.find((m) => m.orgRole === 'owner')?.orgId;
    }

    const ref = randomToken(16);
    const checkoutId = await ctx.db.insert('paymentCheckouts', {
      ref,
      provider,
      purpose: 'dues',
      currency: args.currency,
      amountMinor,
      recurring: false,
      status: 'created',
      userId: user._id,
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      locale: args.locale,
      planId: plan._id,
      category: args.category,
      zone: args.zone,
      ...(orgId ? { orgId } : {}),
      createdAt: Date.now(),
    });
    return {
      checkoutId,
      ref,
      provider,
      purpose: 'dues' as const,
      currency: args.currency,
      amountMinor,
      recurring: false,
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      locale: args.locale,
    };
  },
});

// --- Payment return -------------------------------------------------------------------

// Status of a request, by its reference (random, unguessable token). Returns
// NO personal data: the return page opens without an account.
export const checkoutStatus = query({
  args: { ref: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: checkoutStatusValidator,
      purpose: paymentPurposeValidator,
      recurring: v.boolean(),
      currency: currencyValidator,
      amountMinor: v.number(),
    }),
  ),
  handler: async (ctx, { ref }) => {
    if (ref.length === 0 || ref.length > 64) return null;
    const c = await ctx.db
      .query('paymentCheckouts')
      .withIndex('by_ref', (q) => q.eq('ref', ref))
      .unique();
    if (!c) return null;
    return {
      status: c.status,
      purpose: c.purpose,
      recurring: c.recurring,
      currency: c.currency,
      amountMinor: c.amountMinor,
    };
  },
});

export const prepareSync = internalMutation({
  args: { ref: v.string() },
  returns: v.union(
    v.null(),
    v.object({ provider: providerIdValidator, providerSessionId: v.string() }),
  ),
  handler: async (ctx, { ref }) => {
    if (ref.length === 0 || ref.length > 64) return null;
    const c = await ctx.db
      .query('paymentCheckouts')
      .withIndex('by_ref', (q) => q.eq('ref', ref))
      .unique();
    if (!c || c.status !== 'open' || !c.providerSessionId) return null;
    await enforceRateLimit(ctx, {
      key: `checkoutSync:${ref}`,
      ...RATE_LIMITS.checkoutSync,
    });
    return { provider: c.provider, providerSessionId: c.providerSessionId };
  },
});

// Re-read from the provider when the browser returns: if the webhook is late
// or was never declared, the return page still gets the actual status.
// Same idempotent recording as the webhook; nothing is trusted from the browser.
export const syncCheckout = action({
  args: { ref: v.string() },
  returns: v.null(),
  handler: async (ctx, { ref }) => {
    const target = await ctx.runMutation(
      internal.payments.checkout.prepareSync,
      { ref },
    );
    if (!target) return null;
    const adapter = getAdapter(target.provider);
    if (!adapter.fetchCheckout) return null;
    try {
      const events = await adapter.fetchCheckout(target.providerSessionId);
      if (events.length > 0) {
        await ctx.runMutation(internal.payments.webhooks.applySyncedEvents, {
          provider: target.provider,
          events,
        });
      }
    } catch (err) {
      console.error(`[payments] relecture ${target.provider} impossible`, err);
    }
    return null;
  },
});
