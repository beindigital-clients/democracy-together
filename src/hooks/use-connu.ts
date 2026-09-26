'use client';

import { useState } from 'react';

// « PAS ENCORE CONNU » N'EST PAS « PERSONNE ».
//
// `useQuery` de Convex rend `undefined` tant qu'une réponse n'est pas arrivée,
// et la VALEUR — souvent `null` — une fois qu'elle l'est. Les deux se
// ressemblent sous un `!valeur`, et c'est ce raccourci qui coûte : `undefined`
// revient à CHAQUE reconnexion du socket et à chaque rotation du jeton d'accès,
// sur une query déjà résolue une fois.
//
// Un écran qui rend « Chargement… » sur cet état DÉMONTE son sous-arbre à
// chaque clignotement. Pour l'utilisateur, ce n'est pas un scintillement :
// c'est une boîte de dialogue de confirmation qui disparaît sous le curseur,
// un brouillon perdu, un geste à refaire — et rien à l'écran pour dire
// pourquoi. Observé en CI sur `/admin/utilisateurs` : le dialogue « Changer le
// rôle de … ? » détaché du DOM pendant qu'on cliquait son bouton.
//
// Ce crochet retient la dernière valeur CONNUE. Le premier rendu n'en a pas et
// rend donc `undefined` : l'écran de chargement initial est préservé, c'est
// seulement le clignotement d'après qui cesse de tout emporter.
//
// CE QU'IL NE FAIT PAS : retenir un `null`. Une query qui répond « personne »
// est une réponse, pas une absence de réponse — une déconnexion doit sortir de
// l'écran, et elle le fait.
//
// Il n'affaiblit aucune autorisation. Le rôle lu ici décide de ce qu'on
// AFFICHE ; ce qu'on a le droit de FAIRE est refusé par le serveur à chaque
// mutation, `users.setRole` compris.
//
// MISE EN ŒUVRE : un état ajusté PENDANT le rendu, et non une ref. React
// documente ce motif, et `react-hooks/refs` interdit l'autre — lire ou écrire
// `ref.current` au rendu produit des composants qui ne se remettent pas à
// jour. La comparaison `valeur !== dernier` borne la boucle : sans elle,
// chaque rendu en redemanderait un.
export function useConnu<T>(valeur: T | undefined): T | undefined {
  const [dernier, setDernier] = useState<T | undefined>(valeur);
  if (valeur !== undefined && valeur !== dernier) setDernier(valeur);
  return valeur === undefined ? dernier : valeur;
}
