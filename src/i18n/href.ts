// Jonction d'un chemin et d'une query string.
//
// `usePathname` de @/i18n/navigation rend le chemin SANS la query : c'est ce
// qui faisait perdre les filtres au changement de langue (issue #35). Le
// projet a fait le choix explicite de mettre les facettes dans l'URL — pour
// qu'elles soient partageables et indexables ; le sélecteur de langue était le
// seul endroit à rompre ce contrat, en renvoyant sur /en/bibliotheque une
// personne qui lisait /fr/bibliotheque?theme=gouvernance&sort=cited&page=2.
//
// La query est prise telle quelle (chaîne), jamais reconstruite depuis un
// objet : un paramètre répété (`?theme=a&theme=b`) et l'ordre des clés
// survivent donc à la bascule, ce qu'un aller-retour par `Record` perdrait.
export function withSearchParams(pathname: string, search: string): string {
  const query = search.startsWith('?') ? search.slice(1) : search;
  return query ? `${pathname}?${query}` : pathname;
}
