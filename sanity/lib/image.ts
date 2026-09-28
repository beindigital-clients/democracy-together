import imageUrlBuilder, { type SanityImageSource } from '@sanity/image-url';
import { client } from './client';

const builder = imageUrlBuilder(client);

// Always .auto('format') (WebP/AVIF) + dimensions capped by the component.
export function urlForImage(source: SanityImageSource) {
  return builder.image(source).auto('format').fit('max');
}
