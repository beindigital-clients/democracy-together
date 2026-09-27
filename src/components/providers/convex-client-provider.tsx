'use client';

import type { ReactNode } from 'react';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs';

// `unsavedChangesWarning: false` — R-12 / membre A-12.
//
// Par défaut (`BaseConvexClientOptions.unsavedChangesWarning`, « true in
// browsers » : node_modules/convex/dist/esm-types/browser/sync/client.d.ts),
// le client pose un `beforeunload` qui, tant qu'une mutation est en vol,
// ouvre la boîte native « Are you sure you want to leave? Your changes may
// not be saved. » (browser/sync/client.js, constructeur de BaseConvexClient).
// Ici cette boîte se déclenchait en quittant `/recherche` après un simple
// geste — la mutation en vol était `recordPublicationView`, ou une écriture
// de fond du même genre : rien que l'utilisateur ait saisi, et un message en
// anglais quelle que soit la langue du site (mesuré le 27/09). Aucun écran
// ne s'appuie sur cet avertissement : les formulaires attendent leur réponse
// bouton grisé, et une écriture de compteur perdue ne mérite pas un dialogue.
//
// RESTE, hors de portée d'une option : `ConvexAuthProvider`
// (@convex-dev/auth/dist/react/client.js) pose son propre `beforeunload`
// pendant le rafraîchissement du jeton (`isRefreshingToken`), avec le même
// texte anglais. La fenêtre est courte (le temps d'un appel à /api/auth) ;
// elle n'est pas configurable dans la version 0.0.94 du dépôt.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
