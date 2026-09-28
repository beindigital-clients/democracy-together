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
    // Policy shared by server rendering and client components: a missing
    // interface key fails loudly in development and is logged in
    // production. Vocabulary coming from the database keeps its fallback, but it
    // goes through `vocabulary()` and so never reaches here. See
    // `src/i18n/message-errors.ts`.
    getMessageFallback,
    onError: onMessageError,
  };
});
