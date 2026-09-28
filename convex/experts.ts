import { query } from './_generated/server';

// Expert directory (F-23) — DERIVED from the authors of *published* publications.
// No "experts" table: we aggregate the `authors[].name` of published
// publications (the only ones publicly exposed, like the F-33 library). An
// expert = an author name, with the number of signed publications, the distinct
// themes (neutral slugs) they contributed to, and the most recent
// year. Public read, no fabricated data: the list reflects
// exactly the network's validated contributions.
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
        // Distinct themes, sorted (slugs) for a stable rendering of the badges.
        themes: [...e.themes].sort(),
        latestYear: e.latestYear,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  },
});
