'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import { getMessageFallback, onMessageError } from '@/i18n/message-errors';

// `getMessageFallback` and `onError` are FUNCTIONS: they do not cross
// the RSC boundary and therefore cannot be set on the provider
// from the layout, which is a server component. Without going through a
// client component, the client half of the site would keep next-intl's default
// settings — and the two halves would not react the same way to a
// missing key (issue #33).
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
