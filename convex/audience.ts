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

// MESURE D'AUDIENCE FIRST-PARTY, SANS COOKIE NI IDENTIFIANT (F-66).
//
// Chaîne complète :
//   balise client (src/components/analytics/audience-beacon.tsx)
//     -> `hit` (mutation publique, bornée, anti-abus) : UNE insertion
//     -> `audienceEvents` (tampon de quelques minutes)
//     -> `aggregate` (cron, toutes les 5 min) : compteurs par jour, puis
//        SUPPRESSION des événements bruts
//     -> `audienceDaily` (seule donnée conservée, 13 mois par défaut)
//     -> `overview` / `top` (écran admin/impact, modérateur et au-dessus).
//
// Conditions d'exemption CNIL tenues ici : finalité statistique seule,
// agrégats (aucune donnée par visiteur n'est conservée), pas d'IP stockée
// (l'anti-abus n'en garde qu'une empreinte salée d'une minute, sel détruit
// chaque jour), pas de recoupement possible (aucun identifiant). Le respect
// de Do Not Track / Global Privacy Control et de l'opposition est côté client
// : un navigateur qui le demande n'envoie rien.

const MINUTE = 60_000;
const GLOBAL_SHARDS = 16;

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

// Fenêtre fixe d'une minute sur une clé de `audienceThrottle`. Contention
// limitée : la clé d'un visiteur ne concerne que lui, et le plafond global
// est RÉPARTI sur 16 lignes tirées au hasard.
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

// Point d'entrée PUBLIC de la balise. Ne lève jamais pour une donnée refusée
// ou un plafond atteint : la page vue n'est simplement pas comptée, et la
// réponse est la même (rien à apprendre en sondant).
export const hit = mutation({
  args: {
    path: v.string(),
    lang: v.optional(v.string()),
    referrer: v.optional(v.string()),
    width: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bornes AVANT tout travail : un corps démesuré n'est même pas lu.
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
    // Plafond par visiteur : empreinte SALÉE du bloc d'adresses, jamais
    // l'adresse. Le sel est celui du jour (tourné par `aggregate`) ; sans sel
    // à jour, seul le plafond global s'applique.
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

// AGRÉGATION (cron toutes les 5 min) : les événements bruts deviennent des
// compteurs par jour, puis sont SUPPRIMÉS. Une seule chaîne à la fois (le
// cron, puis ses reprises) : pas de contention sur les compteurs.
const AGG_BATCH = 1000;
export const aggregate = internalMutation({
  args: {},
  returns: v.object({ processed: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    // Rotation du sel anti-abus : l'ancien est ÉCRASÉ, donc détruit.
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
        // BORNE DE CARDINALITÉ : au-delà de N clés distinctes pour ce jour,
        // le compte va dans « (autres) ».
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

    // Fenêtres anti-abus échues : elles ne servent plus à rien, et une
    // empreinte, même salée, n'a pas à survivre à sa minute.
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

// RÉTENTION (cron quotidien) : les agrégats plus vieux que la durée
// configurée sont supprimés.
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

// --- Tableau de bord (écran admin/impact) ------------------------------------

const rangeArgs = {
  // Jour de fin (UTC), fourni par le client : une requête ne lit pas
  // l'horloge (elle ne serait pas réévaluée quand le jour change).
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

// Classements (pages, contenus, référents) — requête séparée : c'est la plus
// lourde (jusqu'à 100 clés par jour), elle ne doit pas retarder les courbes.
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
