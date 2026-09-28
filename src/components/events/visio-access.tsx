'use client';

import { useQuery } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

// VIDEO CONFERENCE LINK FOR AN EVENT — reserved for registrants (F-54).
//
// The detail page is rendered by the server for everyone; the link, however,
// appears in NO public response. This component requests it from
// `contenus/events:myVisioAccess`, which only returns it to a signed-in
// account whose address is among the registrants. The query is reactive:
// someone who registers on this same page sees the link appear without
// reloading.
//
// Three states, one message at a time:
//  - registered, room known           -> the link;
//  - registered, room not yet created -> "vous le recevrez par e-mail";
//  - otherwise                        -> the original text (sent to
//    registrants), plus, for a signed-out visitor, the invitation to sign in.
export function VisioAccess({
  slug,
  defaultText,
}: {
  slug: string;
  // "Le lien est envoyé par e-mail aux inscrits" — label from the detail page.
  defaultText: string;
}) {
  const t = useTranslations('eventRegister');
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(
    api.contenus.events.myVisioAccess,
    isAuthenticated ? { slug } : 'skip',
  );

  if (access?.registered && access.visioUrl) {
    return (
      <div className="mt-3">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {t('visioRegistered')}
        </p>
        <a
          href={access.visioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          {t('visioJoin')}
        </a>
      </div>
    );
  }
  if (access?.registered) {
    return (
      <p
        role="status"
        className="mt-2 text-[13px] leading-relaxed text-ink-soft"
      >
        {t('visioPending')}
      </p>
    );
  }
  return (
    <div className="mt-2 text-[13px] leading-relaxed text-ink-soft">
      <p>{defaultText}</p>
      {!isLoading && !isAuthenticated ? (
        <p className="mt-2">
          {t('visioSignIn')}{' '}
          <Link
            href="/connexion"
            className="inline-block py-2 font-semibold text-accent-text hover:underline"
          >
            {t('visioSignInLink')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
