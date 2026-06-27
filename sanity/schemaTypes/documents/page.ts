import { defineField, defineType } from 'sanity';

// Pages institutionnelles (F-11 Vision/Mission, F-12 Fondateurs & gouvernance).
// i18n au niveau document : un document par langue (champ `language`).
export const page = defineType({
  name: 'page',
  title: 'Page institutionnelle',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Titre',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      title: 'Slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'language',
      type: 'string',
      title: 'Langue',
      options: {
        list: [
          { title: 'Français', value: 'fr' },
          { title: 'English', value: 'en' },
        ],
        layout: 'radio',
      },
      initialValue: 'fr',
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'body', type: 'blockContent', title: 'Contenu' }),
    defineField({ name: 'seo', type: 'seo' }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'language' },
  },
});
