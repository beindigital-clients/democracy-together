import { createClient } from 'next-sanity';
import { apiVersion, dataset, projectId } from '../env';

// UNE LECTURE QUI NE REVIENT PAS NE DOIT PAS TENIR LA PAGE.
//
// Les sept appels publics à ce client, répartis sur six modules, replient tous sur du contenu local
// quand la requête ÉCHOUE — c'est le travail de F-02 et de `fetchOrFallback`,
// et il est complet. Mais un `catch` ne s'exécute qu'une fois la requête
// TERMINÉE. Tant qu'elle ne l'est pas, le rendu serveur attend, et le repli le
// mieux écrit du monde ne sert à rien.
//
// Mesuré sur le serveur de production, hôte Sanity acceptant la connexion sans
// jamais répondre : `/fr` a mis 13,9 s — et rendu 200, par le repli, après
// coup. Sans que rien ne soit journalisé, le `catch` de `src/lib/home.ts`
// étant muet.
//
// POURQUOI `timeout` NE SUFFIT PAS. Le client REJOUE une requête échouée, et le
// délai se paie une fois par tentative : mesuré, `timeout: 3000` seul rejette
// après 21,4 s, pas 3. Les réessais sont donc coupés. Ils ne rendraient service
// que si la panne était plus brève que le délai, et ils coûtent leur durée à
// CHAQUE page tant qu'elle dure — alors que le repli local est complet et
// immédiat. Mieux vaut le contenu local en 2,5 s que le contenu Sanity en 21.
//
// La borne vaut ~50 fois la latence nominale du CDN Sanity (quelques dizaines
// de millisecondes) : elle ne peut pas se déclencher sur une lecture saine.
//
// Le Studio n'est PAS concerné : il monte `sanity.config` et non ce client. Les
// opérations longues de l'éditeur gardent donc leur comportement.
export const SANITY_READ_TIMEOUT_MS = 2_500;

// Exportées pour que la garde puisse construire un client AVEC CES OPTIONS-LÀ
// et le pointer sur un serveur muet, plutôt que de réécrire une configuration
// qui divergerait de celle-ci sans que rien ne le signale.
export const clientOptions = {
  projectId,
  dataset,
  apiVersion,
  // Lectures publiques (CDN, rapide). Pour le mode brouillon : useCdn:false + token.
  useCdn: true,
  timeout: SANITY_READ_TIMEOUT_MS,
  maxRetries: 0,
} as const;

export const client = createClient(clientOptions);
