import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

// DEV/TEST seulement (garde AUTH_DEV_OTP) — nettoyage des contenus créés par
// les specs E2E `contenus-*.spec.ts`.
//
// Un déploiement de dev vit longtemps : sans ménage, chaque exécution
// ajouterait un événement, un partenaire et un média à l'agenda et aux pages
// publiques, et les specs qui lisent ces pages finiraient par compter des
// restes de campagnes passées. Le ménage est BORNÉ au préfixe `e2e-` (slugs,
// noms de fichier) : il ne peut pas toucher un contenu réel, qui n'a aucune
// raison de le porter — et il est fermé hors dev, comme tous les oracles.
const PREFIX = 'e2e-';

export const deleteE2eContent = internalMutation({
  args: {},
  returns: v.union(v.null(), v.object({ deleted: v.number() })),
  handler: async (ctx) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    let deleted = 0;

    for (const e of await ctx.db.query('contentEvents').take(1000)) {
      if (!e.slug.startsWith(PREFIX)) continue;
      for (const r of await ctx.db
        .query('eventRegistrations')
        .withIndex('by_event_and_email', (q) => q.eq('eventSlug', e.slug))
        .take(500))
        await ctx.db.delete(r._id);
      for (const r of await ctx.db
        .query('eventReminders')
        .withIndex('by_event_and_email', (q) => q.eq('eventSlug', e.slug))
        .take(500))
        await ctx.db.delete(r._id);
      await ctx.db.delete(e._id);
      deleted += 1;
    }
    for (const table of [
      'contentReplays',
      'contentPartners',
      'contentThemes',
    ] as const) {
      for (const row of await ctx.db.query(table).take(1000)) {
        if (row.slug.startsWith(PREFIX)) {
          await ctx.db.delete(row._id);
          deleted += 1;
        }
      }
    }
    for (const p of await ctx.db.query('contentPress').take(1000)) {
      if (p.title.startsWith(PREFIX)) {
        await ctx.db.delete(p._id);
        deleted += 1;
      }
    }
    // Médias en dernier : les références ci-dessus sont parties.
    for (const m of await ctx.db.query('contentMedia').take(1000)) {
      if (m.filename.startsWith(PREFIX)) {
        await ctx.storage.delete(m.storageId);
        await ctx.db.delete(m._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});
