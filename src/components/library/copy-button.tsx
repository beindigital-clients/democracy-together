'use client';

import { useRef, useState, type ReactNode } from 'react';

// Bouton « copier dans le presse-papier » avec retour visuel inline (le libellé
// devient « Copié » ~1,4 s). aria-live pour annoncer le succès aux lecteurs
// d'écran. Dégrade proprement si le presse-papier est indisponible.
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
      // presse-papier non disponible : on ne casse rien.
    }
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-live="polite">
      {copied ? copiedLabel : children}
    </button>
  );
}
