import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../../_generated/server';
import type { Doc } from '../../_generated/dataModel';

// RULES FOR AN EVENT BEING OPEN — read from the table, never from the call.
//
// This was pentest item M-5 and limitation A-03 of the campaign: the backend
// did not know about events, it checked the slug against a copied
// list (`UPCOMING_EVENT_SLUGS`) and took the reminder date as the
// caller gave it. The `contentEvents` table makes both decisions
// possible server-side: does the event exist, is it published, is it
// over, are there places left?

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
 * An event accepts registrations as long as it is PUBLISHED and not
 * over. Draft (unknown to the public), cancelled or past: closed.
 */
export function isEventOpen(event: Doc<'contentEvents'>, now: number): boolean {
  return event.status === 'published' && event.endsAt > now;
}

/**
 * The open event with this slug, or the `EVENT_CLOSED` refusal.
 *
 * A SINGLE CODE for "unknown", "draft", "cancelled" and "past": the
 * response of a public action must not be usable to probe for the existence of a
 * draft. The form says "inscriptions closes" in every case.
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

/** No places left: `capacity` registrations already recorded. */
export async function isEventFull(
  ctx: QueryCtx | MutationCtx,
  event: Doc<'contentEvents'>,
): Promise<boolean> {
  if (event.capacity === undefined) return false;
  // Read bounded by the capacity itself: we stop as soon as it is
  // reached, without re-reading the whole list of registrants.
  const regs = await ctx.db
    .query('eventRegistrations')
    .withIndex('by_event_and_email', (q) => q.eq('eventSlug', event.slug))
    .take(event.capacity);
  return regs.length >= event.capacity;
}
