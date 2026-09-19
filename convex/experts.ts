import { query } from './_generated/server';

// Annuaire d'experts (F-23) — DÉRIVÉ des auteurs de publications *publiées*.
// Aucune table « experts » : on agrège les `authors[].name` des publications
// publiées (les seules exposées publiquement, comme la bibliothèque F-33). Un
// expert = un nom d'auteur, avec le nombre de publications signées, les axes
// (thèmes, slugs neutres) distincts auxquels il a contribué, et l'année la plus
// récente. Lecture publique, aucune donnée fabriquée : la liste reflète
// exactement les contributions validées du réseau.
export const listExperts = query({
  args: {},
  handler: async (ctx) => {
    const published = await ctx.db
      .query('publications')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .collect();

    type Agg = {
      name: string;
      count: number;
      themes: Set<string>;
      latestYear: number;
    };
    const byName = new Map<string, Agg>();

    for (const pub of published) {
      for (const author of pub.authors) {
        const name = author.name.trim();
        if (!name) continue;
        const existing = byName.get(name);
        if (existing) {
          existing.count += 1;
          existing.themes.add(pub.theme);
          existing.latestYear = Math.max(existing.latestYear, pub.year);
        } else {
          byName.set(name, {
            name,
            count: 1,
            themes: new Set([pub.theme]),
            latestYear: pub.year,
          });
        }
      }
    }

    return [...byName.values()]
      .map((e) => ({
        name: e.name,
        count: e.count,
        // Thèmes distincts, triés (slugs) pour un rendu stable des badges.
        themes: [...e.themes].sort(),
        latestYear: e.latestYear,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  },
});
