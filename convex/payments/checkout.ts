import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
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
import { requireNetworkRole } from '../lib/rbac';
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

// DEMANDES DE PAIEMENT (F-27/F-28) — du formulaire au prestataire.
//
// Deux temps, parce qu'une mutation n'a pas le réseau : une internalMutation
// VALIDE et enregistre la demande (bornes, plafonds, montant du barème), puis
// l'action ouvre la session chez le prestataire et renvoie l'adresse où
// rediriger. Le paiement n'est inscrit qu'au webhook : le retour du
// navigateur ne prouve rien.

// Message borné du donateur (F-28 : « message du donateur »).
const DONATION_MESSAGE_MAX = 500;

// --- Ce que l'interface doit savoir ------------------------------------------------

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

// --- Ouverture chez le prestataire ------------------------------------------------

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

/** Ouvre la session chez le prestataire. Partagée avec les relances. */
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
      // Un webhook très rapide a pu compléter la demande avant ce retour.
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

// --- Don (F-28) ------------------------------------------------------------------

const donationArgs = {
  currency: currencyValidator,
  // Unités MAJEURES, telles que saisies (20 = 20 €).
  amount: v.number(),
  recurring: v.boolean(),
  email: v.string(),
  name: v.optional(v.string()),
  anonymous: v.boolean(),
  message: v.optional(v.string()),
  locale,
};

// Portail public : reCAPTCHA (le formulaire est ouvert aux visiteurs), puis
// validation et plafonds dans la mutation, puis ouverture chez le prestataire.
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
    // Aucun prestataire pour cette devise : l'interface ne propose pas le
    // bouton, mais le serveur ne suppose rien de l'interface.
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

    // Plafonds non forgeables (IP, global) PUIS par adresse.
    await enforcePublicFormLimit(ctx, 'donation');
    await enforceRateLimit(ctx, {
      key: `donation:${email}`,
      ...RATE_LIMITS.donation,
    });

    const userId = await getAuthUserId(ctx);
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

// --- Cotisation (F-27) ---------------------------------------------------------------

const duesArgs = {
  category: planCategoryValidator,
  zone: planZoneValidator,
  currency: currencyValidator,
  locale,
};

// Réservé aux membres connectés : la cotisation se rattache à un compte (et,
// pour un think tank, à son organisation). Pas de reCAPTCHA : l'appelant est
// authentifié, le plafond par compte suffit.
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

    // Le montant vient du BARÈME, jamais du navigateur.
    const plan = await ctx.db
      .query('paymentPlans')
      .withIndex('by_category_and_zone', (q) =>
        q.eq('category', args.category).eq('zone', args.zone),
      )
      .first();
    const amountMinor =
      args.currency === 'EUR' ? plan?.amountEur : plan?.amountXof;
    if (!plan || !plan.active || amountMinor === undefined) {
      throw new ConvexError('PLAN_UNAVAILABLE');
    }

    await enforceRateLimit(ctx, {
      key: `dues:${user._id}`,
      ...RATE_LIMITS.dues,
    });

    // Cotisation d'organisation : rattachée à l'organisation que le compte
    // représente (propriétaire), pour le suivi du back-office.
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

// --- Retour de paiement ---------------------------------------------------------------

// État d'une demande, par sa référence (jeton aléatoire, non devinable). Ne
// rend AUCUNE donnée personnelle : la page de retour s'ouvre sans compte.
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

// Relecture chez le prestataire au retour du navigateur : si le webhook tarde
// ou n'a jamais été déclaré, la page de retour obtient quand même l'état réel.
// Même inscription idempotente que le webhook ; rien n'est cru du navigateur.
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
