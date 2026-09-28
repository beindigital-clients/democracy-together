import { v } from 'convex/values';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { callerIpBucket } from './lib/rateLimit';
import {
  KEYS_PER_DAY,
  OTHER_KEY,
  dayKey,
  isContentPath,
  isDayKey,
  normalizeLang,
  normalizePath,
  referrerDomain,
  retentionDays,
  screenClass,
  shiftDay,
  throttleLimits,
} from './lib/audience';

// FIRST-PARTY AUDIENCE MEASUREMENT, WITH NO COOKIE OR IDENTIFIER (F-66).
//
// Full chain:
//   client beacon (src/components/analytics/audience-beacon.tsx)
//     -> `hit` (public mutation, bounded, anti-abuse): ONE insertion
//     -> `audienceEvents` (buffer of a few minutes)
//     -> `aggregate` (cron, every 5 min): per-day counters, then
//        DELETION of the raw events
//     -> `audienceDaily` (the only data kept, 13 months by default)
//     -> `overview` / `top` (admin/impact screen, moderator and above).
//
// CNIL exemption conditions upheld here: statistical purpose only,
// aggregates (no per-visitor data is kept), no IP stored
// (anti-abuse only keeps a one-minute salted hash of it, salt destroyed
// every day), no cross-referencing possible (no identifier). Respect
// for Do Not Track / Global Privacy Control and for opt-out is client-side
// : a browser that asks for it sends nothing.

const MINUTE = 60_000;
const GLOBAL_SHARDS = 16;

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

// Fixed one-minute window on an `audienceThrottle` key. Limited
// contention: a visitor's key only concerns them, and the global cap
// is SPREAD over 16 randomly chosen rows.
async function consume(
  ctx: MutationCtx,
  key: string,
  max: number,
  now: number,
): Promise<boolean> {
  const windowStart = now - (now % MINUTE);
  const row = await ctx.db
    .query('audienceThrottle')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!row) {
    await ctx.db.insert('audienceThrottle', { key, count: 1, windowStart });
    return true;
  }
  if (row.windowStart !== windowStart) {
    await ctx.db.patch(row._id, { count: 1, windowStart });
    return true;
  }
  if (row.count >= max) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

function siteHost(): string | undefined {
  try {
    return new URL(process.env.SITE_URL ?? '').hostname;
  } catch {
    return undefined;
  }
}

// PUBLIC entry point of the beacon. Never throws for refused data
// or a reached cap: the page view is simply not counted, and the
// response is the same (nothing to learn by probing).
export const hit = mutation({
  args: {
    path: v.string(),
    lang: v.optional(v.string()),
    referrer: v.optional(v.string()),
    width: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bounds BEFORE any work: an oversized body is not even read.
    if (
      args.path.length > 512 ||
      (args.referrer?.length ?? 0) > 2048 ||
      (args.lang?.length ?? 0) > 8
    ) {
      return null;
    }
    const path = normalizePath(args.path);
    if (!path) return null;

    const now = Date.now();
    const limits = throttleLimits();
    const shard = Math.floor(Math.random() * GLOBAL_SHARDS);
    if (
      !(await consume(
        ctx,
        `g:${shard}`,
        Math.ceil(limits.global / GLOBAL_SHARDS),
        now,
      ))
    ) {
      return null;
    }
    // Per-visitor cap: SALTED hash of the address block, never
    // the address. The salt is the day's (rotated by `aggregate`); without an
    // up-to-date salt, only the global cap applies.
    const bucket = await callerIpBucket(ctx);
    if (bucket) {
      const salt = await ctx.db.query('audienceSalt').first();
      if (salt && salt.day === dayKey(now)) {
        const key = `v:${(await sha256Hex(`${salt.salt}:${bucket}`)).slice(0, 24)}`;
        if (!(await consume(ctx, key, limits.perVisitor, now))) return null;
      }
    }

    await ctx.db.insert('audienceEvents', {
      day: dayKey(now),
      path,
      lang: normalizeLang(args.lang),
      referrer: referrerDomain(args.referrer, siteHost()),
      screen: screenClass(args.width),
      at: now,
    });
    return null;
  },
});

type Dimension = Doc<'audienceDaily'>['dimension'];

async function findRow(
  ctx: MutationCtx,
  dimension: Dimension,
  day: string,
  key: string,
) {
  return await ctx.db
    .query('audienceDaily')
    .withIndex('by_dimension_and_day_and_key', (q) =>
      q.eq('dimension', dimension).eq('day', day).eq('key', key),
    )
    .unique();
}

// AGGREGATION (cron every 5 min): raw events become
// per-day counters, then are DELETED. Only one chain at a time (the
// cron, then its continuations): no contention on the counters.
const AGG_BATCH = 1000;
export const aggregate = internalMutation({
  args: {},
  returns: v.object({ processed: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    // Anti-abuse salt rotation: the old one is OVERWRITTEN, hence destroyed.
    const today = dayKey(now);
    const salt = await ctx.db.query('audienceSalt').first();
    if (!salt || salt.day !== today) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const fresh = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      if (salt) await ctx.db.patch(salt._id, { day: today, salt: fresh });
      else await ctx.db.insert('audienceSalt', { day: today, salt: fresh });
    }

    const events = await ctx.db.query('audienceEvents').take(AGG_BATCH);
    const tally = new Map<string, number>();
    const add = (dim: Dimension, day: string, key: string | undefined) => {
      if (key === undefined) return;
      const k = `${dim}\u0000${day}\u0000${key}`;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    };
    for (const e of events) {
      add('total', e.day, '');
      add('page', e.day, e.path);
      add('lang', e.day, e.lang);
      add('referrer', e.day, e.referrer);
      add('screen', e.day, e.screen);
    }

    for (const [k, n] of tally) {
      const [dim, day, rawKey] = k.split('\u0000') as [
        Dimension,
        string,
        string,
      ];
      let key = rawKey;
      let row = await findRow(ctx, dim, day, key);
      if (!row && (dim === 'page' || dim === 'referrer')) {
        // CARDINALITY BOUND: beyond N distinct keys for this day,
        // the count goes into "(autres)".
        const meta = await findRow(ctx, 'meta', day, dim);
        const used = meta?.count ?? 0;
        if (used >= KEYS_PER_DAY[dim]) {
          key = OTHER_KEY;
          row = await findRow(ctx, dim, day, key);
        } else if (meta) {
          await ctx.db.patch(meta._id, { count: used + 1 });
        } else {
          await ctx.db.insert('audienceDaily', {
            dimension: 'meta',
            day,
            key: dim,
            count: 1,
          });
        }
      }
      if (row) await ctx.db.patch(row._id, { count: row.count + n });
      else {
        await ctx.db.insert('audienceDaily', {
          dimension: dim,
          day,
          key,
          count: n,
        });
      }
    }
    for (const e of events) await ctx.db.delete(e._id);

    // Expired anti-abuse windows: they are no longer of any use, and a
    // hash, even salted, has no business outliving its minute.
    const stale = await ctx.db
      .query('audienceThrottle')
      .withIndex('by_windowStart', (q) => q.lt('windowStart', now - 2 * MINUTE))
      .take(500);
    for (const s of stale) await ctx.db.delete(s._id);

    if (events.length === AGG_BATCH || stale.length === 500) {
      await ctx.scheduler.runAfter(0, internal.audience.aggregate, {});
    }
    return { processed: events.length };
  },
});

// RETENTION (daily cron): aggregates older than the configured
// duration are deleted.
export const purge = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = shiftDay(dayKey(Date.now()), retentionDays());
    const old = await ctx.db
      .query('audienceDaily')
      .withIndex('by_day', (q) => q.lt('day', cutoff))
      .take(500);
    for (const r of old) await ctx.db.delete(r._id);
    if (old.length === 500) {
      await ctx.scheduler.runAfter(0, internal.audience.purge, {});
    }
    return { deleted: old.length };
  },
});

// --- Dashboard (admin/impact screen) -----------------------------------------

const rangeArgs = {
  // End day (UTC), provided by the client: a query does not read
  // the clock (it would not be re-evaluated when the day changes).
  until: v.string(),
  days: v.union(v.literal(7), v.literal(30), v.literal(90)),
};

function range(until: string, days: number): { from: string; to: string } {
  if (!isDayKey(until)) throw new Error('INVALID_DAY');
  return { from: shiftDay(until, days - 1), to: until };
}

const keyCount = v.object({ key: v.string(), count: v.number() });

function sortedTop(m: Map<string, number>, n: number) {
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);
}

export const overview = query({
  args: rangeArgs,
  returns: v.object({
    total: v.number(),
    byDay: v.array(v.object({ day: v.string(), count: v.number() })),
    langs: v.array(keyCount),
    screens: v.array(keyCount),
    retentionDays: v.number(),
  }),
  handler: async (ctx, { until, days }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const { from, to } = range(until, days);
    const read = (dimension: Dimension, cap: number) =>
      ctx.db
        .query('audienceDaily')
        .withIndex('by_dimension_and_day_and_key', (q) =>
          q.eq('dimension', dimension).gte('day', from).lte('day', to),
        )
        .take(cap);
    const [totals, langs, screens] = await Promise.all([
      read('total', 100),
      read('lang', 100 * 5),
      read('screen', 100 * 3),
    ]);
    const perDay = new Map(totals.map((r) => [r.day, r.count]));
    const byDay = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = shiftDay(to, i);
      byDay.push({ day, count: perDay.get(day) ?? 0 });
    }
    const sum = (rows: Doc<'audienceDaily'>[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + r.count);
      return sortedTop(m, 10);
    };
    return {
      total: totals.reduce((a, r) => a + r.count, 0),
      byDay,
      langs: sum(langs),
      screens: sum(screens),
      retentionDays: retentionDays(),
    };
  },
});

// Rankings (pages, content, referrers) — separate query: it is the
// heaviest (up to 100 keys per day), it must not delay the curves.
const TOP_SCAN = 9500;
export const top = query({
  args: {
    ...rangeArgs,
    dimension: v.union(v.literal('page'), v.literal('referrer')),
  },
  returns: v.object({
    items: v.array(keyCount),
    content: v.array(keyCount),
    truncated: v.boolean(),
  }),
  handler: async (ctx, { until, days, dimension }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const { from, to } = range(until, days);
    const rows = await ctx.db
      .query('audienceDaily')
      .withIndex('by_dimension_and_day_and_key', (q) =>
        q.eq('dimension', dimension).gte('day', from).lte('day', to),
      )
      .take(TOP_SCAN);
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + r.count);
    const content = new Map(
      [...m.entries()].filter(
        ([k]) => dimension === 'page' && isContentPath(k),
      ),
    );
    return {
      items: sortedTop(m, 20),
      content: sortedTop(content, 10),
      truncated: rows.length === TOP_SCAN,
    };
  },
});
