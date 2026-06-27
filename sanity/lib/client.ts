import { createClient } from 'next-sanity';
import { apiVersion, dataset, projectId } from '../env';

// Lectures publiques (CDN, rapide). Pour le mode brouillon : useCdn:false + token.
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
});
