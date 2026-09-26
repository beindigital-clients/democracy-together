// FLÈCHES DE LECTURE — « en avant » et « en arrière », pas « à droite » et
// « à gauche ».
//
// Le dépôt écrivait ces flèches en toutes lettres dans le JSX : `{t('next')} →`,
// `← {t('back')}`. C'est correct dans quatre langues sur cinq et FAUX dans la
// cinquième, pour une raison qui ne se voit pas à la lecture du code :
// l'algorithme bidirectionnel d'Unicode REFLÈTE certains caractères selon le
// sens du texte — les parenthèses, les crochets, les chevrons — mais PAS les
// flèches. U+2192 n'a pas la propriété `Bidi_Mirrored`. Dans une page arabe,
// « اقرأ المزيد ← » garderait donc une flèche pointant vers la droite, c'est-à-dire
// vers le DÉBUT de la ligne : le lien « suivant » désignerait le précédent.
//
// POURQUOI DU CSS ET PAS UN TEST SUR LA LOCALE. Ces flèches vivent dans des
// composants SERVEUR (`getTranslations`) comme dans des composants CLIENT
// (`useTranslations`). Lire la locale exigerait deux implémentations, ou de
// rendre client des pages qui n'ont aucune raison de l'être. Le sens d'écriture
// est déjà porté par le `<html dir>` : une règle `[dir='rtl']` le lit sans
// JavaScript, sans locale à passer, et sans frontière à traverser.
//
// Le glyphe est SUBSTITUÉ, pas retourné par une transformation : `scaleX(-1)`
// sur une flèche donne un dessin miroir aux extrémités mal dessinées, là où
// « ← » est un caractère à part entière, crénné avec le texte qui l'entoure.
// Les deux règles sont dans `globals.css`.
//
// Les flèches NON directionnelles restent écrites telles quelles : « ↓ » d'un
// téléchargement descend dans les cinq langues.

/** Flèche « vers la suite » : droite en latin, gauche en arabe. */
export function ArrowForward() {
  return <span aria-hidden="true" className="dt-arrow-fwd" />;
}

/** Flèche « retour » : gauche en latin, droite en arabe. */
export function ArrowBack() {
  return <span aria-hidden="true" className="dt-arrow-back" />;
}
