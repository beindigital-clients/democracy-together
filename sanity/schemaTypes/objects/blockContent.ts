import { defineArrayMember, defineType } from 'sanity';

// Texte riche en Portable Text (jamais de HTML collé). Rendu via @portabletext/react.
export const blockContent = defineType({
  name: 'blockContent',
  title: 'Contenu',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      marks: {
        annotations: [
          {
            name: 'link',
            type: 'object',
            title: 'Lien',
            // SCHÉMA CONTRAINT À LA SAISIE (pentest M-9). Le type `url` de
            // Sanity accepte par défaut plus que ce qu'un lien d'article a à
            // contenir ; `scheme` ferme la liste. C'est la première des deux
            // barrières. La seconde est le rendu
            // (src/components/news/portable-text.tsx), et c'est elle qui garde
            // le dernier mot : le contenu DÉJÀ publié n'est pas revalidé, et
            // un document peut entrer par l'API sans jamais passer par ce
            // formulaire.
            fields: [
              {
                name: 'href',
                type: 'url',
                title: 'URL',
                validation: (Rule) =>
                  Rule.uri({ scheme: ['http', 'https', 'mailto'] }),
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: 'image',
      options: { hotspot: true },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Texte alternatif',
          validation: (Rule) => Rule.required(),
        },
      ],
    }),
  ],
});
