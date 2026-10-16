'use client';

import { useState } from 'react';
import { CopyButton } from '@/components/library/copy-button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// "Cite this contribution" — client island of the PUBLIC KOHOP page. The
// citations are built on the server (`buildCitations`) and every label is passed
// as a prop: the public page sends no message catalogue to the browser.
export function PublicCite({
  citations,
  labels,
}: {
  citations: { apa: string; bibtex: string; ris: string };
  labels: {
    title: string;
    copy: string;
    copied: string;
    ris: string;
    risCopied: string;
  };
}) {
  const [fmt, setFmt] = useState<'apa' | 'bibtex'>('apa');
  const text = fmt === 'bibtex' ? citations.bibtex : citations.apa;
  return (
    <section
      aria-labelledby="kohop-cite"
      className="overflow-hidden rounded-md border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <h2 id="kohop-cite" className="font-display text-base font-semibold">
          {labels.title}
        </h2>
        <ToggleGroup
          type="single"
          size="sm"
          value={fmt}
          onValueChange={(v) => {
            if (v === 'apa' || v === 'bibtex') setFmt(v);
          }}
          aria-label={labels.title}
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
          <CopyButton text={text} copiedLabel={labels.copied}>
            {labels.copy}
          </CopyButton>
          <CopyButton text={citations.ris} copiedLabel={labels.risCopied}>
            {labels.ris}
          </CopyButton>
        </div>
      </div>
    </section>
  );
}
