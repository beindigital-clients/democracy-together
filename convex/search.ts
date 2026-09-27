import { v } from 'convex/values';
import { query } from './_generated/server';
import { fold, organizationHaystack } from './lib/directory';

// Recherche globale (F-06) — sur les contenus Convex : publications publiées
// (titre / auteurs / résumé / points clés) + membres actifs (nom / description
// / pays). Recherche par sous-chaîne, insensible à la casse ET aux accents
// (`fold`, partagé avec l'annuaire — mesuré le 27/09 : « democratie » ne
// trouvait rien ici alors que la bibliothèque, corrigée, le trouvait). Volume
// modeste ; pas d'index plein-texte nécessaire. Le pays d'un membre est
// cherchable par son nom dans les langues du site, pas seulement par son code
// (`organizationHaystack`). Les actualités (Sanity) sont cherchées à part dans
// la page /recherche. Ne renvoie QUE des contenus publics.
const LIMIT = 8;

export const globalSearch = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const needle = fold(q);
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
        fold(
          `${p.title} ${p.authors.map((a) => a.name).join(' ')} ${p.abstract} ${p.keypoints.join(' ')}`,
        ).includes(needle),
      )
      .slice(0, LIMIT)
      .map((p) => ({ slug: p.slug, title: p.title, type: p.type }));

    const organizations = orgs
      .filter((o) => organizationHaystack(o).includes(needle))
      .slice(0, LIMIT)
      .map((o) => ({ slug: o.slug, name: o.name, country: o.country }));

    return { publications, organizations };
  },
});
