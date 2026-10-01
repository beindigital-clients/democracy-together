'use client';

import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// "Copy to clipboard" button (shadcn `Button`, whose `variant` and `size`
// the caller picks) with inline visual feedback (the label becomes "Copié"
// for ~1.4 s). aria-live announces success to screen readers. Degrades
// gracefully if the clipboard is unavailable.
export function CopyButton({
  text,
  children,
  copiedLabel,
  className,
  variant = 'outline',
  size,
}: {
  text: string;
  children: ReactNode;
  copiedLabel: string;
  className?: string;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
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
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      className={className}
      aria-live="polite"
    >
      {copied ? copiedLabel : children}
    </Button>
  );
}
