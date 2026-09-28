import { defineArrayMember, defineType } from 'sanity';

// Rich text in Portable Text (never pasted HTML). Rendered via @portabletext/react.
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
            // SCHEMA CONSTRAINED AT ENTRY (pentest M-9). Sanity's `url` type
            // accepts by default more than an article link needs to
            // contain; `scheme` closes the list. This is the first of two
            // barriers. The second is the rendering
            // (src/components/news/portable-text.tsx), and it is the one that has
            // the final say: ALREADY published content is not revalidated, and
            // a document can come in through the API without ever going through this
            // form.
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
