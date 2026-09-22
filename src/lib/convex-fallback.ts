import { unstable_rethrow } from 'next/navigation';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@convex/_generated/api';

// Une source de données indisponible ne doit pas emporter la page.
//
// La règle est déjà posée par TESTING.md § « Sources externes » et tenue côté
// Sanity : `actualites/page.tsx` enveloppe sa requête, journalise, et rend sa
// liste vide en 200. Côté Convex elle ne l'était pas — les cinq pages qui
// appellent `fetchQuery` au rendu serveur laissaient l'exception remonter, et
// répondaient 500 (audit F-02). Mesuré : `/fr/bibliotheque`, `/fr/experts`,
// `/fr/le-reseau`, `/fr/thematiques` et `/fr/tribune` tombaient ensemble, et
// `sitemap.xml` proposait six de ces adresses à l'indexation.
//
// Ce que ce repli N'EST PAS : un moyen de masquer une panne. L'erreur est
// journalisée telle quelle, et le visiteur voit l'état vide que la page sait
// déjà rendre — celui qu'il obtiendrait si le réseau ne comptait aucun membre.
// Ce qu'il gagne : le reste du site (en-tête, navigation, pied de page, pages
// éditoriales) continue de fonctionner.

/**
 * Exécute une requête et rend `fallback` si elle échoue.
 *
 * Le nom du module dit « convex » parce que c'est le constat qui l'a fait
 * naître, mais cette fonction-ci ne connaît RIEN de Convex : elle prend un
 * thunk. `actualites/[slug]` s'en sert pour Sanity (F-10). Seules les formes
 * vides exportées plus bas sont propres à Convex.
 *
 * L'argument est une FONCTION, pas une promesse : une promesse serait déjà
 * créée — donc déjà en cours — au moment d'entrer dans le `try`, et un jet
 * synchrone au montage de la requête échapperait à la capture.
 */
export async function fetchOrFallback<T>(
  source: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    // Next signale par un JET ce qui n'est pas une panne : `notFound()`,
    // `redirect()`, et surtout la sortie du rendu statique (« Dynamic server
    // usage »), que `fetchQuery` déclenche à chaque génération. Les avaler
    // serait le pire mode de défaillance possible : la route cesserait d'être
    // reconnue comme dynamique et Next figerait le REPLI dans le HTML
    // pré-rendu — une page « momentanément indisponible » servie en
    // permanence, backend en parfait état. `unstable_rethrow` relance ces
    // signaux et ne rend la main que pour une vraie erreur.
    unstable_rethrow(err);
    console.error(`[${source}] Convex indisponible :`, err);
    return fallback;
  }
}

type PublicationList = FunctionReturnType<
  typeof api.publications.listPublished
>;
type DirectoryList = FunctionReturnType<typeof api.organizations.listDirectory>;
type ExpertList = FunctionReturnType<typeof api.experts.listExperts>;
type TribunePostList = FunctionReturnType<typeof api.tribune.listPosts>;
type RelatedPublications = FunctionReturnType<
  typeof api.publications.relatedByTheme
>;

// Les formes vides sont TYPÉES par le retour réel de chaque query
// (`FunctionReturnType`) : le jour où une facette est ajoutée côté Convex, ce
// fichier cesse de compiler au lieu de servir un objet incomplet à la page.
export const EMPTY_PUBLICATION_LIST: PublicationList = {
  items: [],
  facets: { themes: [], types: [], regions: [], languages: [], access: [] },
  total: 0,
};

export const EMPTY_DIRECTORY_LIST: DirectoryList = {
  items: [],
  facets: { regions: [], themes: [], countries: [], languages: [] },
  total: 0,
};

export const EMPTY_EXPERT_LIST: ExpertList = [];

export const EMPTY_TRIBUNE_POSTS: TribunePostList = [];

export const EMPTY_RELATED_PUBLICATIONS: RelatedPublications = [];
