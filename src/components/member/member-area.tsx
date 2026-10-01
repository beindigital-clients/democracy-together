import type { ReactNode } from 'react';
import { getMessages, getTimeZone } from 'next-intl/server';
import { MemberShell } from '@/components/member/member-shell';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import {
  BASE_CLIENT_NAMESPACES,
  MEMBER_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';

// THE MEMBER AREA'S FRAME — its catalogue and its shell (identity, side
// navigation, phone menu), for every screen the navigation leads to.
//
// Most of those screens live under `/espace-membre`, whose layout uses this
// frame. Not all of them: the workspaces (`/espaces`), the notifications and
// the people directory (`/membres`) kept their own addresses — links to them
// are stored in notifications and shared around. Following their entry used
// to drop the navigation on the way: the reader left their space without
// having asked to. They now render inside the same frame.
//
// `shell={false}`: the catalogue only, for a reader who is not signed in (the
// people directory is also a public address, which then shows its
// invitation to sign in, without a column of member entries beside it).
//
// The shell's labels (`member` namespace) are added to the browser catalogue
// here, and only here — the same arrangement as the back office
// (`admin/layout.tsx`): a nested provider REPLACES its descendants'
// catalogue, so it carries the base plus `member`.
export async function MemberArea({
  locale,
  shell = true,
  children,
}: {
  locale: string;
  shell?: boolean;
  children: ReactNode;
}) {
  const messages = pickNamespaces(await getMessages(), [
    ...BASE_CLIENT_NAMESPACES,
    ...MEMBER_NAMESPACES,
  ]);
  const timeZone = await getTimeZone();

  return (
    <IntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {shell ? <MemberShell>{children}</MemberShell> : children}
    </IntlClientProvider>
  );
}
