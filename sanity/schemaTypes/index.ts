import { page } from './documents/page';
import { aboutPage } from './documents/aboutPage';
import { homePage } from './documents/homePage';
import { post } from './documents/post';
import { publication } from './documents/publication';
import { blockContent } from './objects/blockContent';
import { seo } from './objects/seo';

export const schemaTypes = [
  // documents
  page,
  aboutPage,
  homePage,
  post,
  publication,
  // objets réutilisables
  blockContent,
  seo,
];
