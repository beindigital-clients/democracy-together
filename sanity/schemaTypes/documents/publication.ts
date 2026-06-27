import { defineField, defineType } from 'sanity';

// Publications (F-32 dépôt, F-33 métadonnées) — objet éditorial citable.
// Convex gère les usages (vues/téléchargements) et la recherche transverse.
export const publication = defineType({
  name: 'publication',
  title: 'Publication',
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
    defineField({
      name: 'type',
      type: 'string',
      title: 'Type',
      options: {
        list: [
          { title: 'Rapport', value: 'rapport' },
          { title: 'Policy brief', value: 'policy-brief' },
          { title: 'Working paper', value: 'working-paper' },
          { title: 'Article', value: 'article' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'authors',
      type: 'array',
      title: 'Auteurs',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'organization',
      type: 'string',
      title: 'Organisation (think tank)',
    }),
    defineField({
      name: 'themes',
      type: 'array',
      title: 'Thématiques (5 axes)',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'Gouvernance numérique', value: 'gouvernance-numerique' },
          { title: 'Participation citoyenne', value: 'participation-citoyenne' },
          { title: 'Lutte anti-corruption', value: 'anti-corruption' },
          { title: 'Transitions démocratiques', value: 'transitions' },
          { title: 'Crises globales', value: 'crises-globales' },
        ],
      },
    }),
    defineField({ name: 'region', type: 'string', title: 'Région' }),
    defineField({
      name: 'publishedAt',
      type: 'datetime',
      title: 'Date de publication',
    }),
    defineField({ name: 'doi', type: 'string', title: 'DOI' }),
    defineField({
      name: 'accessLevel',
      type: 'string',
      title: 'Accès',
      options: {
        list: [
          { title: 'Ouvert', value: 'public' },
          { title: 'Membres', value: 'membres' },
        ],
        layout: 'radio',
      },
      initialValue: 'public',
    }),
    defineField({ name: 'abstract', type: 'text', rows: 4, title: 'Résumé' }),
    defineField({ name: 'body', type: 'blockContent', title: 'Contenu' }),
    defineField({
      name: 'file',
      type: 'file',
      title: 'PDF',
      options: { accept: '.pdf' },
    }),
    defineField({ name: 'seo', type: 'seo' }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'type' },
  },
});
