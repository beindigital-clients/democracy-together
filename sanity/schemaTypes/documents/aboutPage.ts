import { defineField, defineType } from 'sanity';

// Page À propos (F-11 vision/mission, F-12 fondateurs & gouvernance) — singleton
// éditorial PAR LANGUE (un document `aboutPage` par langue). Schéma structuré
// mirroir de `AboutContent` (src/lib/about-content.ts) : l'équipe édite chaque
// champ texte dans le Studio, le rendu reste identique. Le code conserve un
// fallback local si aucun document n'est publié.

const text = (name: string, title: string, rows = 3) =>
  defineField({ name, title, type: 'text', rows });

// Objet { eyebrow, title?, intro? } réutilisé par plusieurs sections.
const heading = (extra: ReturnType<typeof defineField>[] = []) => [
  defineField({ name: 'eyebrow', title: 'Surtitre', type: 'string' }),
  ...extra,
];

export const aboutPage = defineType({
  name: 'aboutPage',
  title: 'Page À propos',
  type: 'document',
  fields: [
    defineField({
      name: 'language',
      title: 'Langue',
      type: 'string',
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
      name: 'hero',
      title: 'Hero',
      type: 'object',
      fields: [
        defineField({ name: 'eyebrow', type: 'string', title: 'Surtitre' }),
        defineField({ name: 'title', type: 'string', title: 'Titre' }),
        text('lead', 'Accroche'),
      ],
    }),

    defineField({
      name: 'vision',
      title: 'Vision',
      type: 'object',
      fields: [
        ...heading(),
        text('statement', 'Énoncé'),
        defineField({
          name: 'attribution',
          type: 'string',
          title: 'Attribution',
        }),
      ],
    }),

    defineField({
      name: 'mission',
      title: 'Mission',
      type: 'object',
      fields: [
        ...heading(),
        defineField({
          name: 'axes',
          title: 'Axes',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                defineField({ name: 'n', type: 'string', title: 'N°' }),
                defineField({ name: 'title', type: 'string', title: 'Titre' }),
                text('body', 'Texte', 2),
              ],
              preview: { select: { title: 'title', subtitle: 'n' } },
            },
          ],
        }),
      ],
    }),

    defineField({
      name: 'founders',
      title: 'Fondateurs',
      type: 'object',
      fields: [
        ...heading([
          defineField({ name: 'title', type: 'string', title: 'Titre' }),
          text('intro', 'Intro'),
        ]),
        defineField({
          name: 'people',
          title: 'Personnes',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                defineField({ name: 'name', type: 'string', title: 'Nom' }),
                defineField({ name: 'role', type: 'string', title: 'Rôle' }),
                text('bio', 'Biographie', 4),
              ],
              preview: { select: { title: 'name', subtitle: 'role' } },
            },
          ],
        }),
      ],
    }),

    defineField({
      name: 'governance',
      title: 'Gouvernance',
      type: 'object',
      fields: [
        ...heading([
          defineField({ name: 'title', type: 'string', title: 'Titre' }),
          text('intro', 'Intro'),
        ]),
        defineField({
          name: 'hubs',
          title: 'Pôles',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                defineField({ name: 'city', type: 'string', title: 'Ville' }),
                defineField({ name: 'scope', type: 'string', title: 'Portée' }),
                text('body', 'Texte', 2),
              ],
              preview: { select: { title: 'city', subtitle: 'scope' } },
            },
          ],
        }),
        defineField({
          name: 'framework',
          title: 'Cadre',
          type: 'object',
          fields: [
            defineField({ name: 'title', type: 'string', title: 'Titre' }),
            text('body', 'Texte'),
          ],
        }),
        defineField({
          name: 'committees',
          title: 'Comités',
          type: 'object',
          fields: [
            defineField({ name: 'title', type: 'string', title: 'Titre' }),
            defineField({
              name: 'items',
              title: 'Éléments',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({ name: 'n', type: 'string', title: 'N°' }),
                    defineField({ name: 'name', type: 'string', title: 'Nom' }),
                    text('body', 'Texte', 2),
                  ],
                  preview: { select: { title: 'name', subtitle: 'n' } },
                },
              ],
            }),
          ],
        }),
      ],
    }),

    defineField({
      name: 'funding',
      title: 'Financement',
      type: 'object',
      fields: [
        ...heading([
          defineField({ name: 'title', type: 'string', title: 'Titre' }),
          text('intro', 'Intro'),
        ]),
        defineField({
          name: 'sources',
          title: 'Sources',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                defineField({ name: 'name', type: 'string', title: 'Nom' }),
                text('body', 'Texte', 2),
              ],
              preview: { select: { title: 'name' } },
            },
          ],
        }),
        text('note', 'Note'),
      ],
    }),

    defineField({
      name: 'lineage',
      title: 'Filiation',
      type: 'object',
      fields: [
        ...heading([
          defineField({ name: 'title', type: 'string', title: 'Titre' }),
          text('intro', 'Intro'),
        ]),
        defineField({
          name: 'refs',
          title: 'Références',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                defineField({ name: 'name', type: 'string', title: 'Nom' }),
                text('body', 'Texte', 2),
              ],
              preview: { select: { title: 'name' } },
            },
          ],
        }),
      ],
    }),

    defineField({
      name: 'timeline',
      title: 'Calendrier',
      type: 'object',
      fields: [
        ...heading([
          defineField({ name: 'title', type: 'string', title: 'Titre' }),
          text('intro', 'Intro'),
        ]),
        defineField({
          name: 'steps',
          title: 'Étapes',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                defineField({ name: 'date', type: 'string', title: 'Date' }),
                defineField({ name: 'title', type: 'string', title: 'Titre' }),
                text('body', 'Texte', 2),
              ],
              preview: { select: { title: 'title', subtitle: 'date' } },
            },
          ],
        }),
      ],
    }),

    defineField({
      name: 'cta',
      title: 'Appel à action',
      type: 'object',
      fields: [
        defineField({ name: 'title', type: 'string', title: 'Titre' }),
        text('body', 'Texte'),
        defineField({
          name: 'primary',
          type: 'string',
          title: 'Bouton principal',
        }),
        defineField({
          name: 'secondary',
          type: 'string',
          title: 'Bouton secondaire',
        }),
      ],
    }),
  ],
  preview: {
    select: { subtitle: 'language' },
    prepare: ({ subtitle }) => ({ title: 'Page À propos', subtitle }),
  },
});
