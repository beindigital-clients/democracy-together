'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { readConsent, writeConsent, type ConsentValue } from '@/lib/consent';

// Cookie consent banner (F-09). Only appears if no choice has been
// remembered. Honest given the site's actual state: only essential cookies are
// set, and first-party audience measurement (F-66) stores nothing — it is
// exempt from consent, but "Essentiels uniquement" counts as an objection and
// turns it off on this browser (src/lib/audience.ts). Rendered client-side
// only (no SSR -> no hydration mismatch).
export function CookieConsent() {
  const t = useTranslations('cookies');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setShow(true);
  }, []);

  if (!show) return null;

  function choose(value: ConsentValue) {
    writeConsent(value);
    setShow(false);
  }

  return (
    <div
      role="region"
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-line bg-surface/95 shadow-pop backdrop-blur-sm print:hidden"
    >
      <div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <p className="text-sm leading-relaxed text-ink-soft">
          {t('body')}{' '}
          <Link
            href="/confidentialite"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            {t('learnMore')}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2 sm:ms-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => choose('essential')}
          >
            {t('reject')}
          </Button>
          <Button size="sm" onClick={() => choose('all')}>
            {t('accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
