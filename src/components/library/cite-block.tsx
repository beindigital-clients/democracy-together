'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Citations } from '@/lib/publications';
import { CopyButton } from './copy-button';

// Bloc « Citer cette publication » (F-34) — îlot client : bascule APA / BibTeX,
// copie la citation au format courant, et exporte en RIS. Les chaînes de
// citation sont construites côté serveur (lib/publications) et passées en props.
export function CiteBlock({ citations }: { citations: Citations }) {
  const t = useTranslations('library.detail');
  const [fmt, setFmt] = useState<'apa' | 'bibtex'>('apa');
  const text = fmt === 'bibtex' ? citations.bibtex : citations.apa;

  return (
    <section
      id="cite"
      className="mt-12 scroll-mt-24 overflow-hidden rounded-md border border-line bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-semibold">
          {t('citeTitle')}
        </h2>
        <div
          role="group"
          aria-label={t('citeTitle')}
          className="ml-auto inline-flex overflow-hidden rounded-sm border border-line-strong"
        >
          {(['apa', 'bibtex'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFmt(f)}
              aria-pressed={fmt === f}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                fmt === f
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {f === 'apa' ? 'APA' : 'BibTeX'}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
          {text}
        </pre>
        <div className="mt-4 flex flex-wrap gap-3">
          <CopyButton
            text={text}
            copiedLabel={t('citeCopied')}
            className="rounded-sm border border-line-strong px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent-edge hover:bg-accent-tint"
          >
            {t('citeCopy')}
          </CopyButton>
          <CopyButton
            text={citations.ris}
            copiedLabel={t('risCopied')}
            className="rounded-sm border border-line-strong px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent-edge hover:bg-accent-tint"
          >
            {t('citeExportRis')}
          </CopyButton>
        </div>
      </div>
    </section>
  );
}
