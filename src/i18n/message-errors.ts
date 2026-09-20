import { IntlErrorCode, type IntlConfig } from 'next-intl';

// Politique des clés de message absentes (issue #33).
//
// Avant : `getMessageFallback` rendait le dernier segment du chemin et
// `onError` avalait MISSING_MESSAGE. Une clé d'interface absente ne coûtait
// donc pas un mot — `t('library.detail.notFoundTitle')` manquante affichait
// « notFoundTitle » dans la page, en développement comme en production.
// Pendant la PR #4 ce repli muet a transformé une erreur franche
// (`getTranslations` en échec dans une frontière de rendu) en énigme.
//
// La raison invoquée était bonne, la PORTÉE trop large. C'est le vocabulaire
// venu de la base — un slug de thème ou de région hors dictionnaire — qui
// mérite un repli, pas un libellé écrit en dur dans le code. Ce vocabulaire
// passe désormais par `vocabulary()` (src/i18n/vocabulary.ts), qui vérifie la
// présence de la clé AVANT de la demander et n'atteint donc jamais ce module.
// Ce qui arrive ici est par construction une clé d'interface absente,
// c'est-à-dire un bug :
//
//   développement — rendu ⟦chemin.complet⟧ + erreur console : impossible à rater
//   production    — dernier segment (la page ne casse pas) + erreur journalisée
//
// Les deux entrées ci-dessous sont partagées par les deux moitiés de
// l'application : `src/i18n/request.ts` pour le rendu serveur, et
// `IntlClientProvider` pour les composants client. Ces réglages sont des
// fonctions : elles ne traversent pas la frontière RSC, il faut donc les
// poser des deux côtés — sans quoi la moitié client garderait les valeurs par
// défaut de next-intl et les deux moitiés du site ne réagiraient pas pareil.

// Lu à l'appel, et non une fois pour toutes au chargement du module : le
// remplacement statique de `process.env.NODE_ENV` par Next.js reste possible,
// et un test peut basculer d'un environnement à l'autre.
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Chemin complet de la clé, tel qu'on le cherche dans `fr.json` / `en.json`.
export function messagePath(key: string, namespace?: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

// Rendu de repli. Le marqueur ⟦…⟧ n'a rien d'un libellé plausible : il désigne
// la clé fautive à l'écran, là où « notFoundTitle » passait pour du contenu.
export const MISSING_MESSAGE_OPEN = '⟦';
export const MISSING_MESSAGE_CLOSE = '⟧';

export const getMessageFallback: NonNullable<
  IntlConfig['getMessageFallback']
> = ({ error, key, namespace }) => {
  const path = messagePath(key, namespace);

  // Message présent mais inexploitable (ICU invalide, erreur de formatage…) :
  // `onError` l'a déjà signalé, on se contente du chemin — plus parlant que le
  // dernier segment quand il s'agit de retrouver la ligne fautive.
  if (error.code !== IntlErrorCode.MISSING_MESSAGE) return path;

  // Journalisé dans les DEUX environnements. En production c'est le seul moyen
  // de repérer une clé que personne n'a vue manquer en développement ; le
  // chemin complet suffit à la retrouver dans les fichiers de messages.
  console.error(`[i18n] clé de message absente : ${path}`);

  return isProduction() ? (key.split('.').pop() ?? key) : `⟦${path}⟧`;
};

export const onMessageError: NonNullable<IntlConfig['onError']> = (error) => {
  // MISSING_MESSAGE est journalisé par `getMessageFallback`, qui connaît la
  // clé et son espace de noms — `error.message` seul ne les donne pas toujours.
  if (error.code === IntlErrorCode.MISSING_MESSAGE) return;
  console.error(error);
};
