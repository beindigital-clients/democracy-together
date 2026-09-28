import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';
import { COUNTER, readCounters } from './lib/counters';

// Impact measurement & network statistics (F-66) — back office.
// Read restricted to staff (moderator and above): defense in depth,
// the UI already hides the tab from lower roles.
//
// These ten numbers used to be computed at read time, loading FIVE whole
// tables (registrations, subscribers, comments, applications…) on every
// display of the screen. It is precisely the page whose cost would have grown
// with the network's success. It now reads denormalized counters
// (convex/counters.ts), maintained on write: ten single-row reads.
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
