import type { MutationCtx } from '../../_generated/server';
import type { Doc, Id } from '../../_generated/dataModel';

// TEST FIXTURES — a minimal event, dated RELATIVE to the clock.
//
// Tests do not rely on the coded catalog for date rules:
// its events are hard-dated (2026), so an "upcoming" test written
// today would fail on its own the day the date passes. Here, an
// event "in 3 days" is so on every run.
//
// Pure module (no registered Convex function): it lives under `lib/` so it can
// be imported from tests without being exposed.
export async function insertTestEvent(
  ctx: MutationCtx,
  overrides: Partial<Omit<Doc<'contentEvents'>, '_id' | '_creationTime'>> & {
    slug: string;
  },
): Promise<Id<'contentEvents'>> {
  const startsAt = overrides.startsAt ?? Date.now() + 3 * 86_400_000;
  const endsAt = overrides.endsAt ?? startsAt + 2 * 3_600_000;
  const iso = new Date(startsAt).toISOString();
  return await ctx.db.insert('contentEvents', {
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    theme: 'participation',
    langs: ['fr'],
    title: { fr: `Événement ${overrides.slug}` },
    place: { fr: 'En ligne' },
    startDate: iso.slice(0, 10),
    startTime: iso.slice(11, 16),
    timezone: 'UTC',
    status: 'published',
    updatedAt: Date.now(),
    ...overrides,
    startsAt,
    endsAt,
  });
}
