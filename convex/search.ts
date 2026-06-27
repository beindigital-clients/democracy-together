import { v } from 'convex/values';
import { query } from './_generated/server';

// Recherche globale (F-06) — sur les contenus Convex : publications publiées
// (titre / auteurs / résumé) + membres actifs (nom / description / pays).
// Recherche par sous-chaîne, insensible à la casse (volume modeste ; pas
// d'index plein-texte nécessaire). Les actualités (Sanity) sont cherchées à
// part dans la page /recherche. Ne renvoie QUE des contenus publics.
const LIMIT = 8;

export const globalSearch = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) {
      return { publications: [], organizations: [] };
    }

    const [pubs, orgs] = await Promise.all([
      ctx.db
        .query('publications')
        .withIndex('by_status', (s) => s.eq('status', 'published'))
        .collect(),
      ctx.db
        .query('organizations')
        .withIndex('by_status', (s) => s.eq('status', 'active'))
        .collect(),
    ]);

    const publications = pubs
      .filter((p) =>
        `${p.title} ${p.authors.map((a) => a.name).join(' ')} ${p.abstract}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, LIMIT)
      .map((p) => ({ slug: p.slug, title: p.title, type: p.type }));

    const organizations = orgs
      .filter((o) =>
        `${o.name} ${o.description ?? ''} ${o.country}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, LIMIT)
      .map((o) => ({ slug: o.slug, name: o.name, country: o.country }));

    return { publications, organizations };
  },
});
