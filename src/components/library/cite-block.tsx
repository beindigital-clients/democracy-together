'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Citations } from '@/lib/publications';
import { CopyButton } from './copy-button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// "Citer cette publication" block (F-34) — client island: APA / BibTeX toggle,
// copies the citation in the current format, and exports as RIS. The citation
// strings are built server-side (lib/publications) and passed as props.
export function CiteBlock({ citations }: { citations: Citations }) {
  const t = useTranslations('library.detail');
  const [fmt, setFmt] = useState<'apa' | 'bibtex'>('apa');
  const text = fmt === 'bibtex' ? citations.bibtex : citations.apa;

  return (
    <section
      id="cite"
      className="mt-12 scroll-mt-24 overflow-hidden rounded-md border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-semibold">
          {t('citeTitle')}
        </h2>
        <ToggleGroup
          type="single"
          size="sm"
          value={fmt}
          onValueChange={(v) => {
            if (v === 'apa' || v === 'bibtex') setFmt(v);
          }}
          aria-label={t('citeTitle')}
          // `shrink-0`: under increased text spacing (RGAA 10.12), the group no
          // longer squeezes to the point of clipping "BibTeX"; the header wraps
          // instead (measured in the 27/09 E2E replay).
          className="ms-auto shrink-0 flex-nowrap"
        >
          <ToggleGroupItem value="apa">APA</ToggleGroupItem>
          <ToggleGroupItem value="bibtex">BibTeX</ToggleGroupItem>
        </ToggleGroup>
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
