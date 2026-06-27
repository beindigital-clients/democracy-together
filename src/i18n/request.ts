import { getRequestConfig } from 'next-intl/server';
import { hasLocale, IntlErrorCode } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Robustesse : une clé absente (ex. un slug région/thème hors vocabulaire
    // venu de la base) ne doit jamais casser le rendu. On affiche un repli
    // lisible (dernier segment) et on n'escalade pas l'erreur « message manquant ».
    getMessageFallback: ({ key }) => key.split('.').pop() ?? key,
    onError: (error) => {
      if (error.code !== IntlErrorCode.MISSING_MESSAGE) {
        console.error(error);
      }
    },
  };
});
