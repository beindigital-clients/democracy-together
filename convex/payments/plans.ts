import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireNetworkRole } from '../lib/rbac';
import { recordAudit } from '../lib/audit';
import { AUDIT } from '../lib/auditActions';
import {
  defaultPlanAmounts,
  isPlanAmountValid,
  PLAN_CATEGORIES,
  PLAN_ZONES,
  toMinor,
} from '../lib/payments/amounts';
import {
  planCategoryValidator,
  planZoneValidator,
} from '../lib/payments/validators';

// MEMBERSHIP PLAN SCHEDULE (F-27) — category × income zone, one
// amount per currency. It replaces the indicative estimate on /adhesion as soon as
// it exists in the database; the member area bills exactly this schedule.

// Nine combinations at most: the reads below are bounded by
// construction (categories × zones).
const PLAN_MAX = PLAN_CATEGORIES.length * PLAN_ZONES.length;

const publicPlanValidator = v.object({
  category: planCategoryValidator,
  zone: planZoneValidator,
  amountEur: v.union(v.number(), v.null()),
  amountUsd: v.union(v.number(), v.null()),
});

export const publicPlans = query({
  args: {},
  returns: v.array(publicPlanValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query('paymentPlans').take(PLAN_MAX);
    return rows
      .filter((p) => p.active)
      .map((p) => ({
        category: p.category,
        zone: p.zone,
        amountEur: p.amountEur ?? null,
        amountUsd: p.amountUsd ?? null,
      }));
  },
});

export const adminPlans = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('paymentPlans'),
      category: planCategoryValidator,
      zone: planZoneValidator,
      amountEur: v.union(v.number(), v.null()),
      amountUsd: v.union(v.number(), v.null()),
      active: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    const rows = await ctx.db.query('paymentPlans').take(PLAN_MAX);
    return rows.map((p) => ({
      _id: p._id,
      category: p.category,
      zone: p.zone,
      amountEur: p.amountEur ?? null,
      amountUsd: p.amountUsd ?? null,
      active: p.active,
      updatedAt: p.updatedAt,
    }));
  },
});

// Records a plan. Amounts in MAJOR units (entered on screen),
// `null` = plan not offered in this currency. Audited: the schedule sets what
// members pay.
export const upsertPlan = mutation({
  args: {
    category: planCategoryValidator,
    zone: planZoneValidator,
    amountEur: v.union(v.number(), v.null()),
    amountUsd: v.union(v.number(), v.null()),
    active: v.boolean(),
  },
  returns: v.id('paymentPlans'),
  handler: async (ctx, args) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const eur = args.amountEur === null ? null : toMinor(args.amountEur, 'EUR');
    const usd = args.amountUsd === null ? null : toMinor(args.amountUsd, 'USD');
    if (
      (args.amountEur !== null &&
        (eur === null || !isPlanAmountValid(eur, 'EUR'))) ||
      (args.amountUsd !== null &&
        (usd === null || !isPlanAmountValid(usd, 'USD')))
    ) {
      throw new ConvexError('AMOUNT_OUT_OF_BOUNDS');
    }
    if (eur === null && usd === null && args.active) {
      // An active plan without any amount would be a dead button.
      throw new ConvexError('PLAN_WITHOUT_AMOUNT');
    }
    const existing = await ctx.db
      .query('paymentPlans')
      .withIndex('by_category_and_zone', (q) =>
        q.eq('category', args.category).eq('zone', args.zone),
      )
      .first();
    const fields = {
      category: args.category,
      zone: args.zone,
      ...(eur !== null ? { amountEur: eur } : {}),
      ...(usd !== null ? { amountUsd: usd } : {}),
      active: args.active,
      updatedAt: Date.now(),
      updatedBy: admin._id,
    };
    let id;
    if (existing) {
      await ctx.db.replace(existing._id, fields);
      id = existing._id;
    } else {
      id = await ctx.db.insert('paymentPlans', fields);
    }
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PAYMENT_PLAN_CHANGED,
      targetId: id,
      metadata: {
        category: args.category,
        zone: args.zone,
        before: existing
          ? {
              amountEur: existing.amountEur ?? null,
              amountUsd: existing.amountUsd ?? null,
              active: existing.active,
            }
          : null,
        after: { amountEur: eur, amountUsd: usd, active: args.active },
      },
    });
    return id;
  },
});

// Initializes the missing combinations with the default schedule (the one from
// the public estimator, same round figure in dollars). Overwrites nothing.
export const seedDefaultPlans = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    let created = 0;
    for (const category of PLAN_CATEGORIES) {
      for (const zone of PLAN_ZONES) {
        const existing = await ctx.db
          .query('paymentPlans')
          .withIndex('by_category_and_zone', (q) =>
            q.eq('category', category).eq('zone', zone),
          )
          .first();
        if (existing) continue;
        await ctx.db.insert('paymentPlans', {
          category,
          zone,
          ...defaultPlanAmounts(category, zone),
          active: true,
          updatedAt: Date.now(),
          updatedBy: admin._id,
        });
        created++;
      }
    }
    if (created > 0) {
      await recordAudit(ctx, {
        actorId: admin._id,
        action: AUDIT.PAYMENT_PLANS_SEEDED,
        metadata: { created },
      });
    }
    return created;
  },
});
