import { defineField, defineType } from 'sanity';

export const seo = defineType({
  name: 'seo',
  title: 'SEO & partage',
  type: 'object',
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({ name: 'metaTitle', type: 'string', title: 'Titre meta' }),
    defineField({
      name: 'metaDescription',
      type: 'text',
      rows: 3,
      title: 'Description meta',
    }),
    defineField({
      name: 'ogImage',
      type: 'image',
      title: 'Image de partage (Open Graph)',
    }),
  ],
});
