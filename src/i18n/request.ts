import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { getMessageFallback, onMessageError } from './message-errors';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Politique commune au rendu serveur et aux composants client : une clé
    // d'interface absente crie en développement et se journalise en
    // production. Le vocabulaire venu de la base garde son repli, mais il
    // passe par `vocabulary()` et n'arrive donc pas jusqu'ici. Voir
    // `src/i18n/message-errors.ts`.
    getMessageFallback,
    onError: onMessageError,
  };
});
