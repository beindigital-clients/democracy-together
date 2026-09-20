import { v, ConvexError } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  COUNTER,
  ALL_COUNTER_KEYS,
  setCounter,
  type CounterKey,
} from './lib/counters';

// Réconciliation des compteurs dénormalisés (issue #8).
//
// À QUOI ÇA SERT. Les compteurs du back-office sont tenus à l'écriture
// (convex/lib/counters.ts). Deux situations les laissent en retard :
//
//  1. AMORÇAGE — un déploiement qui existait AVANT ce découpage porte déjà des
//     utilisateurs, des publications, des abonnés… et aucune ligne `counters`.
//     `recompute` est le backfill : à jouer UNE FOIS après le déploiement,
//     `npx convex run counters:recompute '{}'`.
//  2. ÉCRITURE DIRECTE — une ligne insérée depuis la console Convex, un script
//     de reprise, ou `t.run()` dans un test unitaire, ne passe par aucune
//     mutation et n'incrémente donc rien.
//
// internalMutation : HORS API publique, invocable seulement depuis le serveur
// ou la CLI. Recompter est une opération d'exploitation, pas une lecture.
//
// BORNE DE TRANSACTION. Recompter, c'est parcourir. Une mutation Convex a une
// limite de documents lus : le parcours est donc plafonné, et un dépassement
// ÉCHOUE au lieu d'écrire un compte faux — un tableau de bord qui ment est pire
// qu'un tableau de bord en erreur. Sur une base volumineuse, recompter clé par
// clé (`'{"key":"users"}'`) reste dans la limite.
const SCAN_CAP = 8000;

async function countRows(
  rows: AsyncIterable<unknown>,
  key: CounterKey,
): Promise<number> {
  let n = 0;
  for await (const _row of rows) {
    void _row;
    if (++n > SCAN_CAP) {
      throw new ConvexError(
        `COUNTER_SCAN_TOO_LARGE:${key} (> ${SCAN_CAP} lignes) — recomptez cette clé seule, ou tenez-la uniquement à l'écriture.`,
      );
    }
  }
  return n;
}

// Recompte UNE clé depuis les tables. Chaque source utilise l'index le plus
// étroit disponible : on ne lit que les lignes qui comptent.
async function recomputeKey(
  ctx: MutationCtx,
  key: CounterKey,
): Promise<number> {
  switch (key) {
    case COUNTER.USERS:
      return await countRows(ctx.db.query('users'), key);
    case COUNTER.ORGANIZATIONS_ACTIVE:
      return await countRows(
        ctx.db
          .query('organizations')
          .withIndex('by_status', (q) => q.eq('status', 'active')),
        key,
      );
    case COUNTER.MEMBERSHIP_APPLICATIONS:
      return await countRows(ctx.db.query('membershipApplications'), key);
    case COUNTER.MEMBERSHIP_APPLICATIONS_PENDING:
      return await countRows(
        ctx.db
          .query('membershipApplications')
          .withIndex('by_status', (q) => q.eq('status', 'pending')),
        key,
      );
    case COUNTER.CONTACT_MESSAGES_UNHANDLED:
      return await countRows(
        ctx.db
          .query('contactMessages')
          .withIndex('by_handled', (q) => q.eq('handled', false)),
        key,
      );
    case COUNTER.PUBLICATIONS_PENDING:
      return await countRows(
        ctx.db
          .query('publications')
          .withIndex('by_status', (q) => q.eq('status', 'pending')),
        key,
      );
    case COUNTER.PUBLICATIONS_PUBLISHED:
      return await countRows(
        ctx.db
          .query('publications')
          .withIndex('by_status', (q) => q.eq('status', 'published')),
        key,
      );
    case COUNTER.EVENT_REGISTRATIONS:
      return await countRows(ctx.db.query('eventRegistrations'), key);
    case COUNTER.NEWSLETTER_SUBSCRIBERS:
      return await countRows(ctx.db.query('newsletterSubscriptions'), key);
    case COUNTER.TRIBUNE_POSTS_PUBLISHED:
      return await countRows(
        ctx.db
          .query('tribunePosts')
          .withIndex('by_status', (q) => q.eq('status', 'published')),
        key,
      );
    case COUNTER.TRIBUNE_COMMENTS_PUBLISHED: {
      // `tribuneComments` n'a pas d'index par statut (l'application lit
      // toujours un fil, jamais « tous les commentaires »). Un index posé pour
      // la seule réconciliation coûterait à chaque écriture de commentaire :
      // on parcourt ici, sous le plafond, plutôt que de taxer le chemin chaud.
      let n = 0;
      let scanned = 0;
      for await (const c of ctx.db.query('tribuneComments')) {
        if (++scanned > SCAN_CAP) {
          throw new ConvexError(
            `COUNTER_SCAN_TOO_LARGE:${key} (> ${SCAN_CAP} lignes) — recomptez cette clé seule, ou tenez-la uniquement à l'écriture.`,
          );
        }
        if (c.status === 'published') n++;
      }
      return n;
    }
    case COUNTER.YOUTH_APPLICATIONS:
      return await countRows(ctx.db.query('youthApplications'), key);
    case COUNTER.YOUTH_APPLICATIONS_PENDING:
      return await countRows(
        ctx.db
          .query('youthApplications')
          .withIndex('by_status', (q) => q.eq('status', 'pending')),
        key,
      );
  }
}

const counterKeyValidator = v.union(
  ...ALL_COUNTER_KEYS.map((k) => v.literal(k)),
);

export const recompute = internalMutation({
  args: { key: v.optional(counterKeyValidator) },
  returns: v.object({
    counters: v.array(v.object({ key: v.string(), value: v.number() })),
  }),
  handler: async (ctx, { key }) => {
    const keys = key ? [key] : ALL_COUNTER_KEYS;
    const counters: { key: string; value: number }[] = [];
    for (const k of keys) {
      const value = await recomputeKey(ctx, k);
      await setCounter(ctx, k, value);
      counters.push({ key: k, value });
    }
    return { counters };
  },
});
