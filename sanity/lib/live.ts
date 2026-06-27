import { defineLive } from 'next-sanity/live';
import { client } from './client';

// Lectures cachées et révalidables par tag (sanityFetch) + <SanityLive/>.
export const { sanityFetch, SanityLive } = defineLive({ client });
