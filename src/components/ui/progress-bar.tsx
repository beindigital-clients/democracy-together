'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

// Progress bar (issue #37). Publication submission accepts PDFs
// up to 20 MB: on a low-bandwidth connection, the upload takes minutes and,
// without visual feedback, nothing distinguishes "it's progressing" from "it's stuck".
//
// `percent` set to `null`: INDETERMINATE progress (total size unknown). The
// bar then stays empty and `aria-valuenow` is absent — that is what signals
// indeterminacy to assistive technologies, rather than an invented
// percentage. No `role="status"`: the percentage changes continuously, and
// announcing it at every step would drown out everything else.
export function ProgressBar({
  label,
  percent,
  text,
  className,
}: {
  label: string;
  percent: number | null;
  // What the bar is worth, spelled out ("42 %", "Préparation…"): read
  // on screen as well as by the screen reader.
  text: string;
  className?: string;
}) {
  const labelId = useId();
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-sm text-ink-soft">
        <span id={labelId}>{label}</span>
        <span className="font-mono text-xs text-muted">{text}</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={text}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-pill border border-line bg-surface-2"
      >
        <div
          className={cn('h-full bg-accent transition-[width] duration-200')}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}
