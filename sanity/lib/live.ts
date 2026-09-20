import { defineLive } from 'next-sanity/live';
import { client } from './client';

// Lectures cachées et révalidables par tag (sanityFetch) + <SanityLive/>.
//
// SANS CONSOMMATEUR AUJOURD'HUI, ET GARDÉ TEL QUEL — décision reportée
// (issue #40). Ce module n'est pas mort par accident : il est mort parce que le
// cache n'a jamais été branché, ce qui est précisément l'objet de #13 (rendu
// statique et cache des pages éditoriales). Le supprimer ici reviendrait à le
// réécrire à l'identique dans #13. Le trancher — brancher `sanityFetch` sur les
// pages éditoriales, ou retirer ce fichier — appartient donc à #13.
export const { sanityFetch, SanityLive } = defineLive({ client });
