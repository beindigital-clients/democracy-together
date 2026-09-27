// CHAMP DE RECHERCHE « PLIÉ » (F-06 / F-34) — logique pure, partagée par les
// mutations qui écrivent les contenus, la migration de remplissage et les
// requêtes de recherche.
//
// POURQUOI UN CHAMP DÉDIÉ. L'index plein texte de Convex découpe en mots et
// ignore la casse, mais PAS les accents : « democratie » ne trouve pas
// « démocratie » (mesuré le 27/09 sur la palette, et c'est ce qui avait fait
// passer la bibliothèque au repli `fold`). On indexe donc une copie du texte
// déjà repliée — minuscules, sans diacritiques, ponctuation remplacée par des
// espaces — et on replie la requête de la même façon avant de la passer à
// `q.search`. Les deux côtés passant par la même fonction, ils ne peuvent pas
// diverger.
//
// POURQUOI LA PONCTUATION DEVIENT UN ESPACE. « démocratie, » doit donner le mot
// « democratie » et non « democratie, » : l'appariement se fait mot à mot (et
// par préfixe sur le dernier terme de la requête). Les lettres de toutes les
// écritures (\p{L}, dont l'arabe) et les chiffres sont conservés.

// Plafond du texte indexé. Un billet « fond » peut atteindre plusieurs milliers
// de caractères ; au-delà de 8 000, la pertinence ne gagne plus rien et chaque
// écriture paie la réindexation du texte entier. Le titre et le résumé sont en
// tête de la meule : ce sont eux qui survivent à la coupe.
export const SEARCH_TEXT_MAX = 8000;

export function foldForSearch(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Apostrophes et traits d'union JOIGNENT des mots (« d'ivoire »,
      // « peer-review ») : on les coupe comme le reste, pour que « ivoire »
      // et « review » soient des mots à part entière.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Meule repliée et bornée, prête à être stockée dans `searchText`. */
export function buildSearchText(parts: Array<string | undefined>): string {
  return foldForSearch(parts.filter(Boolean).join(' ')).slice(
    0,
    SEARCH_TEXT_MAX,
  );
}

// --- Meules par table --------------------------------------------------------
// Chaque table cherchable expose UNE fonction qui dit ce qui se cherche. Elle
// est appelée à l'écriture (insertion, correction du texte) et par la
// migration `searchIndexing.backfill`. Ajouter un champ ici sans relancer la
// migration laisse les anciens documents sur l'ancienne meule : la migration
// est idempotente, elle se relance sans risque.

export function publicationSearchText(p: {
  title: string;
  authors: { name: string }[];
  abstract: string;
  keypoints: string[];
}): string {
  return buildSearchText([
    p.title,
    p.authors.map((a) => a.name).join(' '),
    p.abstract,
    p.keypoints.join(' '),
  ]);
}

// Le pays est cherchable par son NOM dans les langues du site (« Kenya »
// trouve la fiche `KE`) : `countryTerms` vient de l'annuaire, qui le faisait
// déjà en mémoire. Le calcul se fait une fois, à l'écriture.
export function organizationSearchText(
  o: { name: string; description?: string; country: string },
  countryTerms: (code: string) => string,
): string {
  return buildSearchText([o.name, o.description, countryTerms(o.country)]);
}

export function tribuneSearchText(p: {
  title: string;
  body: string;
  authorName: string;
}): string {
  return buildSearchText([p.title, p.authorName, p.body]);
}

/** Année (UTC) d'un horodatage — filtre « date » des contenus datés au jour. */
export function yearOf(ms: number): number {
  return new Date(ms).getUTCFullYear();
}

// Terme de requête : même repli que la meule, borné. `null` = pas de recherche
// (moins de deux caractères utiles, comme la palette et le back-office).
export const QUERY_MIN = 2;
export const QUERY_MAX = 100;

export function searchQuery(raw: string | undefined): string | null {
  if (!raw) return null;
  const q = foldForSearch(raw.slice(0, QUERY_MAX * 2)).slice(0, QUERY_MAX);
  return q.replace(/\s/g, '').length >= QUERY_MIN ? q : null;
}
