'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import { getMessageFallback, onMessageError } from '@/i18n/message-errors';

// `getMessageFallback` et `onError` sont des FONCTIONS : elles ne franchissent
// pas la frontière RSC et ne peuvent donc pas être posées sur le fournisseur
// depuis le layout, qui est un composant serveur. Sans ce passage par un
// composant client, la moitié client du site garderait les réglages par
// défaut de next-intl — et les deux moitiés ne réagiraient pas pareil à une
// clé absente (issue #33).
export function IntlClientProvider({
  locale,
  messages,
  timeZone,
  children,
}: {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
      getMessageFallback={getMessageFallback}
      onError={onMessageError}
    >
      {children}
    </NextIntlClientProvider>
  );
}
