import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../../_generated/server';
import type { Doc } from '../../_generated/dataModel';

// RÈGLES D'OUVERTURE D'UN ÉVÉNEMENT — lues dans la table, jamais dans l'appel.
//
// C'était le point M-5 du pentest et la limite A-03 de la campagne : le backend
// ne connaissait pas les événements, il confrontait le slug à une liste
// recopiée (`UPCOMING_EVENT_SLUGS`) et prenait la date de rappel telle que
// l'appelant la donnait. La table `contentEvents` rend les deux décisions
// possibles côté serveur : l'événement existe-t-il, est-il publié, est-il
// terminé, reste-t-il des places ?

export async function findEventBySlug(
  ctx: QueryCtx | MutationCtx,
  slug: string,
): Promise<Doc<'contentEvents'> | null> {
  return await ctx.db
    .query('contentEvents')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
}

/**
 * Un événement accepte des inscriptions tant qu'il est PUBLIÉ et qu'il n'est
 * pas terminé. Brouillon (inconnu du public), annulé ou passé : fermé.
 */
export function isEventOpen(event: Doc<'contentEvents'>, now: number): boolean {
  return event.status === 'published' && event.endsAt > now;
}

/**
 * L'événement ouvert portant ce slug, ou le refus `EVENT_CLOSED`.
 *
 * UN SEUL CODE pour « inconnu », « brouillon », « annulé » et « passé » : la
 * réponse d'une action publique ne doit pas servir à sonder l'existence d'un
 * brouillon. Le formulaire dit « inscriptions closes » dans tous les cas.
 */
export async function requireOpenEvent(
  ctx: QueryCtx | MutationCtx,
  slug: string,
  now: number,
): Promise<Doc<'contentEvents'>> {
  const event = await findEventBySlug(ctx, slug);
  if (!event || !isEventOpen(event, now)) throw new ConvexError('EVENT_CLOSED');
  return event;
}

/** Plus aucune place : `capacity` inscriptions déjà enregistrées. */
export async function isEventFull(
  ctx: QueryCtx | MutationCtx,
  event: Doc<'contentEvents'>,
): Promise<boolean> {
  if (event.capacity === undefined) return false;
  // Lecture bornée par la capacité elle-même : on s'arrête dès qu'elle est
  // atteinte, sans relire toute la liste des inscrits.
  const regs = await ctx.db
    .query('eventRegistrations')
    .withIndex('by_event_and_email', (q) => q.eq('eventSlug', event.slug))
    .take(event.capacity);
  return regs.length >= event.capacity;
}
