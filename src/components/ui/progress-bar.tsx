'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

// Barre de progression (issue #37). Le dépôt de publication accepte des PDF
// jusqu'à 20 Mo : sur une connexion à faible débit, l'envoi dure des minutes et,
// sans retour visuel, rien ne distingue « ça avance » de « c'est bloqué ».
//
// `percent` à `null` : progression INDÉTERMINÉE (taille totale inconnue). La
// barre reste alors vide et `aria-valuenow` est absent — c'est ce qui signale
// l'indétermination aux technologies d'assistance, plutôt qu'un pourcentage
// inventé. Pas de `role="status"` : le pourcentage change en continu, et le
// faire annoncer à chaque pas couvrirait tout le reste.
export function ProgressBar({
  label,
  percent,
  text,
  className,
}: {
  label: string;
  percent: number | null;
  // Ce que la barre vaut, en toutes lettres (« 42 % », « Préparation… ») : lu
  // à l'écran comme au lecteur d'écran.
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
