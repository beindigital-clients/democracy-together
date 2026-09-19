import { defineField, defineType } from 'sanity';

// Page d'accueil (F-10) — singleton éditorial PAR LANGUE (un document `homePage`
// par langue). Schéma structuré mirroir de `HomeContent` (src/lib/home-content)
// + le hero. L'équipe édite chaque champ dans le Studio ; le rendu reste
// identique, avec fallback local par section si rien n'est publié.

const str = (name: string, title: string) =>
  defineField({ name, title, type: 'string' });
const txt = (name: string, title: string, rows = 3) =>
  defineField({ name, title, type: 'text', rows });
const strList = (name: string, title: string) =>
  defineField({ name, title, type: 'array', of: [{ type: 'string' }] });

// Tableau d'objets anonymes { ...fields } avec aperçu sur `title`.
const objList = (
  name: string,
  title: string,
  fields: ReturnType<typeof defineField>[],
  previewTitle = 'title',
  previewSubtitle?: string,
) =>
  defineField({
    name,
    title,
    type: 'array',
    of: [
      {
        type: 'object',
        fields,
        preview: {
          select: { title: previewTitle, subtitle: previewSubtitle ?? '' },
        },
      },
    ],
  });

const obj = (
  name: string,
  title: string,
  fields: ReturnType<typeof defineField>[],
) => defineField({ name, title, type: 'object', fields });

export const homePage = defineType({
  name: 'homePage',
  title: "Page d'accueil",
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

    obj('hero', 'Hero', [
      str('eyebrow', 'Surtitre'),
      str('title', 'Titre'),
      txt('lead', 'Accroche'),
      str('ctaPrimary', 'Bouton principal'),
      str('ctaSecondary', 'Bouton secondaire'),
      str('visualLabel', "Texte alternatif (alt) de l'image"),
      str('visualCaption', "Légende affichée sur l'image"),
      objList(
        'creds',
        'Mentions (bande méta)',
        [str('label', 'Libellé'), str('value', 'Valeur')],
        'value',
        'label',
      ),
    ]),

    obj('mission', 'Mission', [
      str('title', 'Titre'),
      str('cta', 'Lien'),
      objList(
        'cells',
        'Cellules (bento)',
        [str('ix', 'Index'), str('title', 'Titre'), txt('body', 'Texte', 3)],
        'title',
        'ix',
      ),
      obj('barometer', 'Encart baromètre', [
        str('label', 'Surtitre'),
        str('title', 'Titre'),
        txt('body', 'Texte'),
      ]),
    ]),

    obj('analyses', 'Dernières analyses', [
      str('title', 'Titre'),
      str('cta', 'Lien'),
      obj('featured', 'À la une', [
        str('tag', 'Étiquette'),
        str('title', 'Titre'),
        txt('body', 'Texte'),
        strList('chips', 'Puces'),
      ]),
      objList('items', 'Éléments', [
        str('tag', 'Étiquette'),
        str('title', 'Titre'),
        txt('body', 'Texte', 2),
      ]),
    ]),

    obj('barometre', 'Baromètre', [
      str('eyebrow', 'Surtitre'),
      str('title', 'Titre'),
      txt('body', 'Texte'),
      objList(
        'countries',
        'Pays',
        [str('name', 'Nom'), str('score', 'Score')],
        'name',
        'score',
      ),
      strList('legend', 'Légende'),
      str('note', 'Note'),
      str('mapLabel', 'Libellé carte'),
      strList('links', 'Liens'),
    ]),

    obj('axes', 'Axes de travail', [
      str('title', 'Titre'),
      objList(
        'items',
        'Axes',
        [str('n', 'N°'), str('title', 'Titre'), txt('body', 'Texte', 2)],
        'title',
        'n',
      ),
    ]),

    obj('events', 'Événements', [
      str('title', 'Titre'),
      str('cta', 'Lien'),
      obj('featured', 'À la une', [
        str('tag', 'Étiquette'),
        str('title', 'Titre'),
        txt('body', 'Texte'),
        str('action', 'Action'),
      ]),
      objList(
        'items',
        'Éléments',
        [
          str('date', 'Date'),
          str('kind', 'Type'),
          str('title', 'Titre'),
          str('meta', 'Méta'),
        ],
        'title',
        'date',
      ),
    ]),

    obj('youth', 'Hub jeunes', [
      str('eyebrow', 'Surtitre'),
      str('title', 'Titre'),
      txt('body', 'Texte'),
      str('cta', 'Lien'),
      objList(
        'steps',
        'Étapes',
        [str('n', 'N°'), str('title', 'Titre'), txt('body', 'Texte', 2)],
        'title',
        'n',
      ),
    ]),

    obj('join', 'Rejoindre', [
      str('title', 'Titre'),
      txt('body', 'Texte'),
      objList(
        'plans',
        'Formules',
        [
          str('label', 'Étiquette'),
          str('title', 'Titre'),
          strList('features', 'Avantages'),
          str('cta', 'Bouton'),
        ],
        'title',
        'label',
      ),
    ]),

    obj('newsletter', 'Newsletter', [
      str('title', 'Titre'),
      txt('body', 'Texte'),
      str('cta', 'Bouton'),
      str('placeholder', 'Placeholder du champ'),
    ]),
  ],
  preview: {
    select: { subtitle: 'language' },
    prepare: ({ subtitle }) => ({ title: "Page d'accueil", subtitle }),
  },
});
