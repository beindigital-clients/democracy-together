'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  browserDoNotTrack,
  readAudienceOptOut,
  writeAudienceOptOut,
} from '@/lib/audience';

// RÉGLAGE D'OPPOSITION À LA MESURE D'AUDIENCE (F-66) — posé dans la politique
// de confidentialité, là où la mesure est décrite. Case à cocher native : elle
// est lisible au clavier et au lecteur d'écran sans rien réinventer, et
// l'état est dit en toutes lettres à côté (pas seulement par la coche).
export function AudienceOptOut() {
  const t = useTranslations('privacy');
  // `null` avant montage : l'état vit dans le navigateur, le serveur ne le
  // connaît pas — on ne rend pas un état faux le temps de l'hydratation.
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
      {/* Libellé ENVELOPPANT : toute la ligne (44 px) est la cible du clic. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-ink">
        <input
          type="checkbox"
          checked={optedOut}
          onChange={(e) => {
            writeAudienceOptOut(e.target.checked);
            setOptedOut(e.target.checked);
          }}
          className="size-5 shrink-0 accent-[var(--color-accent-text)]"
        />
        <span className="wrap-anywhere">{t('optOutLabel')}</span>
      </label>
      <p role="status" className="mt-2 text-sm text-ink-soft">
        {dnt ? t('optOutBrowser') : off ? t('optOutOn') : t('optOutOff')}
      </p>
    </div>
  );
}
