import type { MutationCtx } from '../../_generated/server';
import type { Doc, Id } from '../../_generated/dataModel';

// JEU D'ESSAI DES TESTS — un événement minimal, daté RELATIVEMENT à l'horloge.
//
// Les tests ne s'appuient pas sur le catalogue codé pour les règles de date :
// ses événements sont datés en dur (2026), donc un test « à venir » écrit
// aujourd'hui échouerait tout seul le jour où la date passe. Ici, un
// événement « dans 3 jours » l'est à chaque exécution.
//
// Module pur (aucune fonction Convex enregistrée) : il vit sous `lib/` pour
// être importé des tests sans être exposé.
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
