import { Fragment } from 'react';
import { formatAuthorParts } from '@/lib/publications';

// Liste d'auteurs de la fiche publication : « A, B et C » / « A, B, and C ».
//
// Les NOMS sont en gras, les séparateurs en texte courant — et ces séparateurs
// sont une règle de LANGUE, pas une règle à écrire ici. La fiche les assemblait
// à la main, en choisissant la conjonction par un ternaire sur la locale
// (issue #34) : le libellé « Par »/« By » n'entrait alors dans aucun fichier de
// messages, et la règle inventée oubliait la virgule anglaise avant « and ».
//
// `formatAuthorParts` (Intl.ListFormat) rend la liste DÉCOUPÉE : les segments
// `element` sont les noms, les segments `literal` les séparateurs. C'est ce
// découpage qui permet de mettre les noms en gras sans toucher à la ponctuation
// — et de ne rien avoir à réécrire le jour où une troisième langue arrive.
export function AuthorList({
  names,
  locale,
}: {
  names: string[];
  locale: string;
}) {
  return (
    <>
      {formatAuthorParts(names, locale).map((part, i) =>
        part.type === 'element' ? (
          <b key={`${part.type}-${i}`} className="font-semibold text-ink">
            {part.value}
          </b>
        ) : (
          <Fragment key={`${part.type}-${i}`}>{part.value}</Fragment>
        ),
      )}
    </>
  );
}
