'use client';

import { useRef, useState, type ReactNode } from 'react';

// "Copy to clipboard" button with inline visual feedback (the label
// becomes "Copié" for ~1.4 s). aria-live announces success to screen
// readers. Degrades gracefully if the clipboard is unavailable.
export function CopyButton({
  text,
  children,
  copiedLabel,
  className,
}: {
  text: string;
  children: ReactNode;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable: break nothing.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-live="polite"
    >
      {copied ? copiedLabel : children}
    </button>
  );
}
