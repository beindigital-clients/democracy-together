// Lecture de la sortie de `npx convex run`.
//
// LE DÉFAUT CORRIGÉ ICI. L'ancienne version ne gardait que la DERNIÈRE ligne
// non vide de la sortie, en supposant qu'elle portait la valeur JSON. C'est
// vrai d'un scalaire (`"123456"`, `true`) mais faux d'un objet : la CLI
// l'imprime sur plusieurs lignes, la dernière est `}`, qui ne parse pas — et
// l'ancien `catch` renvoyait `null` sans bruit.
//
// Conséquence : TOUTE requête de relecture renvoyant un objet valait `null`.
// `latestContactForEmail`, `latestApplicationForEmail` — donc `stored?.subject`
// et `stored?.organizationName` valaient `undefined`, et les specs de contact,
// d'adhésion et du parcours anglais échouaient sur « Received: undefined »
// alors que le formulaire, lui, avait bien stocké. Les helpers à scalaire
// (`getOtp`, `isNewsletterSubscribed`) masquaient le défaut en fonctionnant.
//
// La sortie peut être précédée de lignes de log, et suivie d'autres : on
// cherche donc le plus grand bloc de lignes, au départ le plus précoce, qui
// forme un JSON valide. Une ligne de log ne parse pas, elle est écartée
// d'elle-même.
export function parseConvexRunOutput<T>(out: string): T | null {
  const lines = out.trim().split('\n');
  for (let start = 0; start < lines.length; start++) {
    for (let end = lines.length; end > start; end--) {
      const candidate = lines.slice(start, end).join('\n').trim();
      if (!candidate) continue;
      try {
        return JSON.parse(candidate) as T;
      } catch {
        /* pas un JSON complet : on essaie un bloc plus court */
      }
    }
  }
  return null;
}
