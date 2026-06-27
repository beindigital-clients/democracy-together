import { query } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';

// Mesure d'impact & statistiques du réseau (F-66) — back-office.
// Compteurs agrégés RÉELS, calculés à la lecture à partir des tables existantes.
// Lecture réservée au staff (modérateur et au-dessus) : défense en profondeur,
// l'UI masque déjà l'onglet aux rôles inférieurs.
export const impactStats = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');

    const [
      publishedPublications,
      activeOrganizations,
      eventRegistrations,
      newsletterSubscribers,
      publishedTribunePosts,
      tribuneComments,
      youthApplications,
      membershipApplications,
    ] = await Promise.all([
      // Publications publiées (index by_status).
      ctx.db
        .query('publications')
        .withIndex('by_status', (q) => q.eq('status', 'published'))
        .collect(),
      // Organisations actives de l'annuaire (index by_status).
      ctx.db
        .query('organizations')
        .withIndex('by_status', (q) => q.eq('status', 'active'))
        .collect(),
      // Inscriptions aux événements — pas de status, décompte sur l'ensemble.
      ctx.db.query('eventRegistrations').collect(),
      // Abonnés à la newsletter — décompte sur l'ensemble.
      ctx.db.query('newsletterSubscriptions').collect(),
      // Prises de parole de la tribune publiées (index by_status).
      ctx.db
        .query('tribunePosts')
        .withIndex('by_status', (q) => q.eq('status', 'published'))
        .collect(),
      // Commentaires de la tribune — pas d'index par statut, on filtre.
      ctx.db.query('tribuneComments').collect(),
      // Candidatures jeunes (total + en attente).
      ctx.db.query('youthApplications').collect(),
      // Candidatures d'adhésion (total + en attente).
      ctx.db.query('membershipApplications').collect(),
    ]);

    return {
      publishedPublications: publishedPublications.length,
      activeOrganizations: activeOrganizations.length,
      eventRegistrations: eventRegistrations.length,
      newsletterSubscribers: newsletterSubscribers.length,
      tribunePosts: publishedTribunePosts.length,
      tribuneComments: tribuneComments.filter((c) => c.status === 'published')
        .length,
      youthApplications: youthApplications.length,
      youthApplicationsPending: youthApplications.filter(
        (a) => a.status === 'pending',
      ).length,
      membershipApplications: membershipApplications.length,
      membershipApplicationsPending: membershipApplications.filter(
        (a) => a.status === 'pending',
      ).length,
    };
  },
});
