'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  browserDoNotTrack,
  readAudienceOptOut,
  writeAudienceOptOut,
} from '@/lib/audience';
import { Checkbox } from '@/components/ui/checkbox';

// AUDIENCE MEASUREMENT OPT-OUT SETTING (F-66) — placed in the privacy
// policy, where the measurement is described. Native checkbox: it is
// usable by keyboard and screen reader without reinventing anything, and
// the state is spelled out next to it (not only by the tick).
export function AudienceOptOut() {
  const t = useTranslations('privacy');
  // `null` before mount: the state lives in the browser, the server does not
  // know it — we do not render a wrong state during hydration.
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [dnt, setDnt] = useState(false);

  useEffect(() => {
    setOptedOut(readAudienceOptOut());
    setDnt(browserDoNotTrack());
  }, []);

  if (optedOut === null) return <div className="min-h-[88px]" />;

  const off = optedOut || dnt;
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      {/* WRAPPING label: the whole row (44 px) is the click target. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-ink">
        <Checkbox
          checked={optedOut}
          onCheckedChange={(checked) => {
            writeAudienceOptOut(checked === true);
            setOptedOut(checked === true);
          }}
        />
        <span className="wrap-anywhere">{t('optOutLabel')}</span>
      </label>
      <p role="status" className="mt-2 text-sm text-ink-soft">
        {dnt ? t('optOutBrowser') : off ? t('optOutOn') : t('optOutOff')}
      </p>
    </div>
  );
}
