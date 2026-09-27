import type { Locale } from '@/i18n/routing';

// QUE MONTRE-T-ON AU LECTEUR ? — décision pure, testable seule.
//
// Un contenu déposé par un membre existe dans UNE langue. Le lecteur en demande
// une autre. Entre les deux, il y a peut-être une traduction en cache, peut-être
// périmée, peut-être en échec. Cinq états, et la page doit en afficher un seul
// — avec, dans chaque cas, de quoi comprendre ce qu'elle a sous les yeux.
//
// La règle qui gouverne tout le reste : L'ORIGINAL NE DISPARAÎT JAMAIS. Une
// traduction automatique n'est pas une édition ; elle s'affiche sous une
// mention explicite, et l'original reste à un clic. C'est la même honnêteté que
// la clause « le français prévaut » des pages légales.
//
// POURQUOI UN MODULE PUR, et pas un `if` dans la page : ces cinq états se
// décident deux fois (billet de Tribune, publication) et se vérifient une —
// dans `tests/unit/article-translation.test.ts`. La page, elle, ne fait que
// rendre le verdict.

export type TranslationFields = {
  title: string;
  abstract?: string;
  keypoints?: string[];
  body: string[];
};

/** Ce que la query Convex `translation.getTranslation` renvoie. */
export type CachedTranslation = {
  status: 'pending' | 'ready' | 'failed';
  sourceLocale: Locale;
  targetLocale: Locale;
  fields?: TranslationFields;
  error?: string;
  fresh: boolean;
} | null;

export type ArticleDisplay =
  /** La langue du contenu est celle du lecteur : rien à signaler. */
  | { kind: 'native' }
  /** Le lecteur a demandé l'original, ou aucune traduction n'existe encore. */
  | {
      kind: 'original';
      sourceLocale: Locale;
      /** Une traduction à jour existe : on peut y renvoyer. */
      translationAvailable: boolean;
      /** Une traduction existe mais décrit une version périmée du texte. */
      stale: boolean;
      /** La dernière tentative a échoué ; `errorCode` dit pourquoi. */
      errorCode?: string;
    }
  /** Traduction affichée, original à un clic. */
  | {
      kind: 'translated';
      sourceLocale: Locale;
      fields: TranslationFields;
    };

/**
 * Décide de l'affichage.
 *
 * @param sourceLocale langue de rédaction du contenu
 * @param readerLocale langue de la page
 * @param cached       traduction en cache pour `readerLocale`, ou null
 * @param wantsOriginal le lecteur a demandé l'original (`?original=1`)
 */
export function resolveArticleDisplay(
  sourceLocale: Locale,
  readerLocale: Locale,
  cached: CachedTranslation,
  wantsOriginal: boolean,
): ArticleDisplay {
  // 1. Même langue : aucun bandeau, aucune offre. Le cas le plus fréquent, et
  //    celui où toute mention serait du bruit.
  if (sourceLocale === readerLocale) return { kind: 'native' };

  const usable =
    cached?.status === 'ready' && cached.fresh && cached.fields !== undefined;

  // 2. Le lecteur a explicitement demandé l'original. Son choix prime sur la
  //    disponibilité d'une traduction — c'est tout l'objet du lien.
  if (wantsOriginal) {
    return {
      kind: 'original',
      sourceLocale,
      translationAvailable: usable,
      stale: false,
      // Un échec n'a pas à être rappelé à quelqu'un qui lit l'original de son
      // plein gré : il a déjà ce qu'il est venu chercher.
      errorCode: undefined,
    };
  }

  // 3. Traduction à jour : on la sert, sous mention.
  if (usable) {
    return { kind: 'translated', sourceLocale, fields: cached.fields! };
  }

  // 4. et 5. Pas de traduction utilisable. On sert l'original en disant
  //    pourquoi : périmée (l'auteur a corrigé son texte), en échec, ou
  //    simplement jamais demandée.
  return {
    kind: 'original',
    sourceLocale,
    translationAvailable: false,
    stale: cached?.status === 'ready' && !cached.fresh,
    errorCode:
      cached?.status === 'failed' ? (cached.error ?? 'UNKNOWN') : undefined,
  };
}

/**
 * Suffixe de clé de message pour un code d'échec de traduction.
 *
 * Les libellés vivent dans le catalogue sous `translation.err*` et se
 * demandent par `vocabulary(t, 'err', suffixe)` — le mécanisme prévu par le
 * dépôt pour une clé construite à l'exécution (src/i18n/vocabulary.ts).
 * L'alternative, `t(cléCalculée)`, est explicitement interdite par
 * `tests/unit/i18n-keys.test.ts`, et pour une bonne raison : elle ferait passer
 * un code inattendu venu de la passerelle pour une clé d'interface manquante,
 * c'est-à-dire un bug, alors que c'est un cas de repli normal.
 *
 * Tout ce qui n'est pas dans cette table retombe sur `errGeneric` : la
 * passerelle peut renvoyer un code nouveau demain, la page ne doit pas s'en
 * émouvoir.
 */
const ERROR_SUFFIXES: Record<string, string> = {
  AI_GATEWAY_NOT_CONFIGURED: 'NotConfigured',
  RATE_LIMITED: 'RateLimited',
  TOO_LONG: 'TooLong',
  FORBIDDEN: 'Forbidden',
};

export function translationErrorSuffix(code: string | undefined): string {
  return (code && ERROR_SUFFIXES[code]) || 'Generic';
}
