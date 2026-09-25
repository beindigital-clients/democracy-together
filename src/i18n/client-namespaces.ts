import type { AbstractIntlMessages } from 'next-intl';

// Ce que le catalogue de messages envoie au NAVIGATEUR (audit F-05).
//
// Avant : le layout passait `getMessages()` ENTIER au fournisseur client, soit
// les 32 espaces de noms du catalogue sérialisés dans le HTML de CHAQUE page.
// Mesuré sur `/fr/a-propos` : 39 valeurs longues sur 39 appartenant à des
// écrans que la page ne rend pas — rappels d'événement, back-office, tunnel
// d'adhésion — présentes dans le document servi. Sur 142 Ko de HTML, le
// catalogue en pesait 44.
//
// Un composant SERVEUR lit ses messages par `getTranslations`, qui n'envoie
// rien au navigateur. Seuls les composants marqués `'use client'` ont besoin
// d'un catalogue de ce côté-là. Les deux listes ci-dessous sont donc
// exactement l'ensemble des espaces qu'ils demandent — ni plus, ni moins — et
// `tests/unit/i18n-client-namespaces.test.ts` les RECALCULE depuis les
// sources à chaque exécution, pour qu'elles ne puissent pas dériver en
// silence.
//
// Pourquoi une liste et pas un filtrage page par page : un composant client
// peut n'être monté qu'à l'interaction (palette de recherche, bandeau de
// cookies, dialogues). Un filtre calculé au chargement de la page les
// manquerait, et une clé absente ne casse rien à l'écran — elle rend le
// dernier segment. Le défaut serait donc invisible. La liste, elle, se dérive
// statiquement de TOUS les composants client, quel que soit le moment où ils
// arrivent.

/**
 * Espaces demandés par des composants client rendus hors du back-office.
 *
 * C'est ce que porte le HTML de toutes les pages publiques.
 */
export const BASE_CLIENT_NAMESPACES = [
  'auth',
  'contact',
  'cookies',
  'errors',
  'eventRegister',
  // `footer` N'Y EST PAS, et c'est le test qui l'a dit : `site-footer.tsx`
  // appelle bien `useTranslations('footer')`, mais sans directive `'use
  // client'` et sans être importé depuis une frontière client. C'est donc un
  // composant serveur, qui lit ses messages sans rien envoyer au navigateur.
  // Ma liste écrite à la main l'avait inclus.
  'library',
  'membership',
  'mentorship',
  'nav',
  'newsletter',
  'notifications',
  'projects',
  'reminder',
  'search',
  'tribune',
  'workspaces',
  'youthApply',
] as const;

/**
 * Espaces que SEUL le back-office demande.
 *
 * `admin` pèse 10 Ko à lui seul — 22 % du catalogue — pour des écrans
 * derrière authentification, interdits au crawl, et qu'aucun visiteur public
 * n'atteint. Il est donc posé par `admin/layout.tsx` et non par le layout
 * racine. Vérifié : tous les composants client qui le demandent vivent sous
 * `app/[locale]/admin/` ou `components/admin/`.
 */
export const ADMIN_NAMESPACES = ['admin'] as const;

/** Tous les espaces demandés par un composant client, où qu'il soit. */
export const CLIENT_NAMESPACES = [
  ...BASE_CLIENT_NAMESPACES,
  ...ADMIN_NAMESPACES,
] as const;

/**
 * Restreint un catalogue aux espaces nommés.
 *
 * Un espace absent du catalogue est ignoré plutôt que rendu `undefined` :
 * `next-intl` traiterait la valeur nulle comme un espace vide et masquerait
 * l'erreur. Son absence, elle, fait parler `getMessageFallback`.
 */
export function pickNamespaces(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const out: Record<string, unknown> = {};
  for (const ns of namespaces) {
    if (ns in messages) out[ns] = messages[ns];
  }
  return out as AbstractIntlMessages;
}
