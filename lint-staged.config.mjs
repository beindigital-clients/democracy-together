// Contrôles de pré-commit, sur les fichiers INDEXÉS uniquement.
//
// Ce crochet existe pour une raison précise : le dépôt vient d'absorber un
// passage de formatage de 168 fichiers. Rien ne servirait de le refaire tous
// les trois mois — il faut que le code arrive formaté. lint-staged corrige et
// réindexe à la place du contributeur plutôt que de refuser le commit.
//
// Coût : `eslint --fix` déclenche les règles typées, qui construisent le
// programme TypeScript entier — environ 8 secondes, quel que soit le nombre de
// fichiers indexés. C'est le prix de règles qui voient les types ; le passer en
// non typé rendrait muettes les règles qui ont trouvé de vrais défauts ici
// (no-floating-promises, no-base-to-string, no-misused-promises).
//
// `--no-warn-ignored` : un fichier indexé mais couvert par les exclusions
// d'eslint.config.mjs (convex/_generated/) ne doit pas faire échouer le commit.
export default {
  '*.{ts,tsx,mts,cts,mjs,js,cjs}': [
    'eslint --fix --no-warn-ignored',
    'prettier --write',
  ],
  '*.{json,css,yml,yaml}': ['prettier --write'],
};
