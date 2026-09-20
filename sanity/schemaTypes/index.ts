import { aboutPage } from './documents/aboutPage';
import { homePage } from './documents/homePage';
import { post } from './documents/post';
import { blockContent } from './objects/blockContent';
import { seo } from './objects/seo';

export const schemaTypes = [
  // documents
  aboutPage,
  homePage,
  post,
  // objets réutilisables
  blockContent,
  seo,
];
