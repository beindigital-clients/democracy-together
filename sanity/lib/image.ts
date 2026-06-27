import imageUrlBuilder, { type SanityImageSource } from '@sanity/image-url';
import { client } from './client';

const builder = imageUrlBuilder(client);

// Toujours .auto('format') (WebP/AVIF) + dimensions plafonnées en composant.
export function urlForImage(source: SanityImageSource) {
  return builder.image(source).auto('format').fit('max');
}
