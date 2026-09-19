import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';
import { COUNTER, readCounters } from './lib/counters';

// Mesure d'impact & statistiques du réseau (F-66) — back-office.
// Lecture réservée au staff (modérateur et au-dessus) : défense en profondeur,
// l'UI masque déjà l'onglet aux rôles inférieurs.
//
// Ces dix nombres étaient calculés à la lecture, en chargeant CINQ tables
// entières (inscriptions, abonnés, commentaires, candidatures…) à chaque
// affichage de l'écran. C'est précisément la page dont le coût aurait grandi
// avec le succès du réseau. Elle lit désormais des compteurs dénormalisés
// (convex/counters.ts), tenus à l'écriture : dix lectures d'une ligne.
export const impactStats = query({
  args: {},
  returns: v.object({
    publishedPublications: v.number(),
    activeOrganizations: v.number(),
    eventRegistrations: v.number(),
    newsletterSubscribers: v.number(),
    tribunePosts: v.number(),
    tribuneComments: v.number(),
    youthApplications: v.number(),
    youthApplicationsPending: v.number(),
    membershipApplications: v.number(),
    membershipApplicationsPending: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');

    const c = await readCounters(ctx, [
      COUNTER.PUBLICATIONS_PUBLISHED,
      COUNTER.ORGANIZATIONS_ACTIVE,
      COUNTER.EVENT_REGISTRATIONS,
      COUNTER.NEWSLETTER_SUBSCRIBERS,
      COUNTER.TRIBUNE_POSTS_PUBLISHED,
      COUNTER.TRIBUNE_COMMENTS_PUBLISHED,
      COUNTER.YOUTH_APPLICATIONS,
      COUNTER.YOUTH_APPLICATIONS_PENDING,
      COUNTER.MEMBERSHIP_APPLICATIONS,
      COUNTER.MEMBERSHIP_APPLICATIONS_PENDING,
    ]);

    return {
      publishedPublications: c[COUNTER.PUBLICATIONS_PUBLISHED],
      activeOrganizations: c[COUNTER.ORGANIZATIONS_ACTIVE],
      eventRegistrations: c[COUNTER.EVENT_REGISTRATIONS],
      newsletterSubscribers: c[COUNTER.NEWSLETTER_SUBSCRIBERS],
      tribunePosts: c[COUNTER.TRIBUNE_POSTS_PUBLISHED],
      tribuneComments: c[COUNTER.TRIBUNE_COMMENTS_PUBLISHED],
      youthApplications: c[COUNTER.YOUTH_APPLICATIONS],
      youthApplicationsPending: c[COUNTER.YOUTH_APPLICATIONS_PENDING],
      membershipApplications: c[COUNTER.MEMBERSHIP_APPLICATIONS],
      membershipApplicationsPending: c[COUNTER.MEMBERSHIP_APPLICATIONS_PENDING],
    };
  },
});
