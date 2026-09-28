'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useMutation } from 'convex/react';
import { usePathname } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';
import { audienceAllowed, isMeasuredPath } from '@/lib/audience';

// AUDIENCE MEASUREMENT BEACON (F-66, outreach workstream) — renders nothing.
//
// One page view = one call to `audience.hit`, with four pieces of information
// and not one more: the path (without query or language prefix: that is what
// next-intl's `usePathname` returns), the language, the referrer (on the FIRST
// display only — after that, the referrer of an internal navigation would be
// our own site) and the window width, which the server reduces to a
// class. No cookie, no identifier, nothing in local storage.
//
// Opt-out is honoured AT THE SOURCE (`audienceAllowed`): Do Not Track /
// GPC, "Essentiels uniquement", or the privacy policy setting — in those
// cases, nothing is sent.
//
// A send failure is ignored: measurement must never break anything in the
// page, nor display anything.
export function AudienceBeacon() {
  const pathname = usePathname();
  const locale = useLocale();
  const hit = useMutation(api.audience.hit);
  const first = useRef(true);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    last.current = pathname;
    const referrer = first.current ? document.referrer || undefined : undefined;
    first.current = false;
    if (!isMeasuredPath(pathname) || !audienceAllowed()) return;
    hit({
      path: pathname,
      lang: locale,
      referrer,
      width: window.innerWidth,
    }).catch(() => {
      /* measurement lost: no consequence for the page */
    });
  }, [pathname, locale, hit]);

  return null;
}
