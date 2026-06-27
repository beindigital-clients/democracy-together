'use client';

import { useState } from 'react';
import { useConvexAuth, useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// Réaction « soutien » (comme un like) sur une prise de parole. Îlot client :
// décompte réactif via useQuery(reactionState). Déconnecté -> lien vers la
// connexion. Connecté -> bouton qui bascule (toggleReaction) ; l'état `mine`
// pilote le libellé (Soutenir / Soutenu) et le style actif.
export function ReactionButton({ postId }: { postId: string }) {
  const t = useTranslations('tribune');
  const { isAuthenticated } = useConvexAuth();
  const state = useQuery(api.tribune.reactionState, {
    postId: postId as Id<'tribunePosts'>,
  });
  const toggle = useMutation(api.tribune.toggleReaction);
  const [pending, setPending] = useState(false);

  const count = state?.count ?? 0;
  const mine = state?.mine ?? false;

  // Pictogramme « pouce levé » inline (pas de dépendance icône supplémentaire).
  const Thumb = () => (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <path d="M7.5 8.5 10.2 3a1.6 1.6 0 0 1 3 .7v3.3h3.1a1.6 1.6 0 0 1 1.57 1.94l-1.2 5.5A1.9 1.9 0 0 1 14.8 16H7.5V8.5ZM3 8.7h2.6V16H3a.9.9 0 0 1-.9-.9V9.6A.9.9 0 0 1 3 8.7Z" />
    </svg>
  );

  // Déconnecté : lien vers la connexion (libellé + décompte), comme report-button.
  if (!isAuthenticated) {
    return (
      <Link
        href="/connexion"
        className="inline-flex items-center gap-2 rounded-pill border border-line-strong px-3.5 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Thumb />
        <span>{t('react')}</span>
        <span aria-hidden="true" className="text-line-strong">
          ·
        </span>
        <span className="font-mono text-[12px] text-muted">
          {t('reactionsCount', { count })}
        </span>
      </Link>
    );
  }

  async function onClick() {
    setPending(true);
    try {
      await toggle({ postId: postId as Id<'tribunePosts'> });
    } catch {
      /* refusé (rôle/rate-limit) : on n'insiste pas */
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || state === undefined}
      aria-pressed={mine}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60',
        mine
          ? 'border-accent-edge bg-accent-tint text-accent-text hover:bg-accent-tint/70'
          : 'border-line-strong text-ink-soft hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Thumb />
      <span>{mine ? t('reacted') : t('react')}</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span className="font-mono text-[12px]">
        {t('reactionsCount', { count })}
      </span>
    </button>
  );
}
