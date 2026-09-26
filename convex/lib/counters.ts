import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

// Compteurs dénormalisés du back-office (issue #8, audit § 4.3).
//
// POURQUOI. Les tableaux de bord (admin.dashboardStats, impact.impactStats,
// newsletter.subscriberCount) comptaient en chargeant les tables entières puis
// en lisant `.length`. Aujourd'hui les tables sont presque vides, donc c'est
// rapide ; le jour où l'annuaire compte quelques centaines d'organisations et
// la bibliothèque quelques milliers de publications, l'écran d'administration
// devient le point le plus coûteux du produit — et Convex facture à la donnée
// lue. Les guidelines du dépôt l'interdisent explicitement
// (convex/_generated/ai/guidelines.md : « Never use `.collect().length` »).
//
// COMMENT. Une ligne par compteur dans la table `counters`, lue en O(1) par
// l'index `by_key`, incrémentée DANS LA TRANSACTION qui écrit la donnée
// comptée. Si l'écriture échoue, l'incrément est annulé avec elle.
//
// LIMITE ASSUMÉE. Un compteur est une copie : une écriture qui contourne les
// mutations (console Convex, script direct, `t.run()` dans un test) le laisse
// derrière. C'est pour cela que `counters.recompute` existe — voir
// convex/counters.ts.

// Registre FERMÉ des clés. Une clé inconnue ne compile pas : le compteur lu par
// un tableau de bord et celui posé par une mutation ne peuvent pas diverger sur
// une faute de frappe.
export const COUNTER = {
  USERS: 'users',
  ORGANIZATIONS_ACTIVE: 'organizations.active',
  MEMBERSHIP_APPLICATIONS: 'membershipApplications',
  MEMBERSHIP_APPLICATIONS_PENDING: 'membershipApplications.pending',
  CONTACT_MESSAGES_UNHANDLED: 'contactMessages.unhandled',
  PUBLICATIONS_PENDING: 'publications.pending',
  PUBLICATIONS_PUBLISHED: 'publications.published',
  EVENT_REGISTRATIONS: 'eventRegistrations',
  NEWSLETTER_SUBSCRIBERS: 'newsletterSubscriptions',
  TRIBUNE_POSTS_PUBLISHED: 'tribunePosts.published',
  TRIBUNE_COMMENTS_PUBLISHED: 'tribuneComments.published',
  YOUTH_APPLICATIONS: 'youthApplications',
  YOUTH_APPLICATIONS_PENDING: 'youthApplications.pending',
  // Modération assistée par IA — trois nombres qui disent, sans relire le
  // journal, ce que le dispositif fait réellement : combien d'analyses, dont
  // combien de mises en ligne automatiques et combien de renvois en file.
  // C'est le rapport des deux derniers qui dira si le barème est trop lâche
  // (tout passe) ou inutile (rien ne passe).
  AI_REVIEWS: 'aiModerationReviews',
  AI_REVIEWS_PUBLISHED: 'aiModerationReviews.published',
  AI_REVIEWS_ESCALATED: 'aiModerationReviews.escalated',
} as const;

export type CounterKey = (typeof COUNTER)[keyof typeof COUNTER];

export const ALL_COUNTER_KEYS: readonly CounterKey[] = Object.values(COUNTER);

// Incrément (ou décrément) d'un compteur. Crée la ligne au premier passage.
//
// Le compteur est BORNÉ À ZÉRO : un décrément sur un compteur non encore
// amorcé (déploiement existant dont `recompute` n'a pas encore tourné) doit
// afficher 0, pas un nombre négatif — une donnée fausse se voit, une donnée
// absurde décrédibilise l'écran entier.
export async function bumpCounter(
  ctx: MutationCtx,
  key: CounterKey,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const row = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!row) {
    await ctx.db.insert('counters', { key, value: Math.max(0, delta) });
    return;
  }
  await ctx.db.patch(row._id, { value: Math.max(0, row.value + delta) });
}

// Fixe la valeur d'un compteur (réservé à la réconciliation — cf. recompute).
export async function setCounter(
  ctx: MutationCtx,
  key: CounterKey,
  value: number,
): Promise<void> {
  const row = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!row) {
    await ctx.db.insert('counters', { key, value });
    return;
  }
  if (row.value !== value) await ctx.db.patch(row._id, { value });
}

// Lecture d'un compteur. Une ligne absente vaut 0 : un déploiement neuf, ou
// une clé ajoutée après coup, affiche zéro plutôt que d'échouer.
export async function readCounter(
  ctx: QueryCtx,
  key: CounterKey,
): Promise<number> {
  const row = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return row?.value ?? 0;
}

// Lecture groupée — une lecture indexée par clé, en parallèle.
export async function readCounters<K extends CounterKey>(
  ctx: QueryCtx,
  keys: readonly K[],
): Promise<Record<K, number>> {
  const values = await Promise.all(keys.map((k) => readCounter(ctx, k)));
  const out = {} as Record<K, number>;
  keys.forEach((k, i) => {
    out[k] = values[i];
  });
  return out;
}

// --- Transitions d'état ------------------------------------------------------
//
// La plupart des compteurs suivent un CHANGEMENT DE STATUT, pas une simple
// insertion : une candidature passe de « en attente » à « approuvée », une
// publication de « soumise » à « publiée », un billet de la Tribune de
// « publié » à « retiré ». Décrire la transition (`from` -> `to`, `null` = la
// ligne n'existe pas encore / plus) plutôt que d'écrire deux `bumpCounter` à la
// main sur chaque site : un site d'écriture ne peut plus oublier la moitié du
// mouvement.

type PublicationStatus = Doc<'publications'>['status'];
type ApplicationStatus = Doc<'membershipApplications'>['status'];
type YouthStatus = Doc<'youthApplications'>['status'];
type ContentStatus = Doc<'tribunePosts'>['status'];
type OrganizationStatus = Doc<'organizations'>['status'];

export async function trackPublicationStatus(
  ctx: MutationCtx,
  from: PublicationStatus | null,
  to: PublicationStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'pending')
    await bumpCounter(ctx, COUNTER.PUBLICATIONS_PENDING, -1);
  if (from === 'published')
    await bumpCounter(ctx, COUNTER.PUBLICATIONS_PUBLISHED, -1);
  if (to === 'pending') await bumpCounter(ctx, COUNTER.PUBLICATIONS_PENDING, 1);
  if (to === 'published')
    await bumpCounter(ctx, COUNTER.PUBLICATIONS_PUBLISHED, 1);
}

export async function trackMembershipApplicationStatus(
  ctx: MutationCtx,
  from: ApplicationStatus | null,
  to: ApplicationStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === null) await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS, 1);
  if (to === null) await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS, -1);
  if (from === 'pending')
    await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS_PENDING, -1);
  if (to === 'pending')
    await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS_PENDING, 1);
}

export async function trackYouthApplicationStatus(
  ctx: MutationCtx,
  from: YouthStatus | null,
  to: YouthStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === null) await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS, 1);
  if (to === null) await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS, -1);
  if (from === 'pending')
    await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS_PENDING, -1);
  if (to === 'pending')
    await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS_PENDING, 1);
}

export async function trackTribunePostStatus(
  ctx: MutationCtx,
  from: ContentStatus | null,
  to: ContentStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_POSTS_PUBLISHED, -1);
  if (to === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_POSTS_PUBLISHED, 1);
}

export async function trackTribuneCommentStatus(
  ctx: MutationCtx,
  from: ContentStatus | null,
  to: ContentStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_COMMENTS_PUBLISHED, -1);
  if (to === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_COMMENTS_PUBLISHED, 1);
}

export async function trackOrganizationStatus(
  ctx: MutationCtx,
  from: OrganizationStatus | null,
  to: OrganizationStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'active')
    await bumpCounter(ctx, COUNTER.ORGANIZATIONS_ACTIVE, -1);
  if (to === 'active') await bumpCounter(ctx, COUNTER.ORGANIZATIONS_ACTIVE, 1);
}

export async function trackContactHandled(
  ctx: MutationCtx,
  from: boolean | null,
  to: boolean | null,
): Promise<void> {
  if (from === to) return;
  if (from === false)
    await bumpCounter(ctx, COUNTER.CONTACT_MESSAGES_UNHANDLED, -1);
  if (to === false)
    await bumpCounter(ctx, COUNTER.CONTACT_MESSAGES_UNHANDLED, 1);
}
