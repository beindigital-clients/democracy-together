// Traduction du VOCABULAIRE : les libellés dont la clé est construite à partir
// d'une valeur venue de la base — slug de thème (`library.themes.*`), de région
// (`directory.regions.*`), statut d'une candidature, étape de revue…
//
// Ces clés forment la seule famille qui MÉRITE un repli (issue #33). Le
// vocabulaire est dupliqué entre le backend, les seeds et les messages
// (`THEMES` vit dans quatre fichiers, issue #30) : il peut donc diverger, et un
// slug inattendu ne doit pas emporter la page. Les libellés d'interface, eux,
// sont écrits en dur dans le code : une clé absente y est toujours un bug, et
// `src/i18n/message-errors.ts` la traite comme tel.
//
// La séparation tient à une seule règle, vérifiée par
// `tests/unit/i18n-keys.test.ts` :
//
//   clé littérale, écrite en entier   -> `t('detail.notFoundTitle')`
//   clé construite à l'exécution      -> `vocabulary(t, 'themes.', slug)`
//
// `vocabulary()` demande d'abord `t.has(key)`, qui répond sans lever ni
// journaliser quoi que ce soit. Une clé de vocabulaire absente n'atteint donc
// jamais `getMessageFallback` : le repli strict reste entier pour le reste.

export type VocabularyTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

// Repli par défaut : le terme rendu lisible, plutôt que le slug brut.
// « gouvernance-numerique » -> « Gouvernance numerique ». Sans accents ni
// formulation soignée, mais présentable — et sans jamais laisser croire qu'il
// s'agit du libellé traduit.
export function humanizeTerm(term: string): string {
  const words = term.replace(/[-_]+/g, ' ').trim();
  if (!words) return term;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Libellé d'un terme de vocabulaire, avec repli explicite.
 *
 * @param t        traducteur de l'espace de noms (`useTranslations` ou `getTranslations`)
 * @param prefix   début de la clé, séparateur compris : `'themes.'`, `'revStage_'`
 * @param term     la valeur venue de la base, qui complète la clé
 * @param fallback libellé de repli ; par défaut `humanizeTerm(term)`
 */
export function vocabulary(
  t: VocabularyTranslator,
  prefix: string,
  term: string,
  fallback?: string,
): string {
  const key = `${prefix}${term}`;
  if (t.has(key)) return t(key);

  // Pas une erreur : le repli est le comportement attendu. Mais en
  // développement, un terme hors dictionnaire signale presque toujours un
  // vocabulaire qui a divergé entre la base et les messages — autant le dire.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] vocabulaire hors dictionnaire : ${key}`);
  }

  return fallback ?? humanizeTerm(term);
}
