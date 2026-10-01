'use client';

import { useState } from 'react';
import { useConvexAuth, useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Toggle, toggleVariants } from '@/components/ui/toggle';

// Inline "thumbs up" pictogram (no extra icon dependency).
// Declared OUTSIDE the component: a function created on each render is a new
// component type every time, which forces React to unmount then remount the
// subtree instead of updating it.
function Thumb() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <path d="M7.5 8.5 10.2 3a1.6 1.6 0 0 1 3 .7v3.3h3.1a1.6 1.6 0 0 1 1.57 1.94l-1.2 5.5A1.9 1.9 0 0 1 14.8 16H7.5V8.5ZM3 8.7h2.6V16H3a.9.9 0 0 1-.9-.9V9.6A.9.9 0 0 1 3 8.7Z" />
    </svg>
  );
}

// "Support" reaction (like a like) on a post. Client island:
// reactive count via useQuery(reactionState). Signed out -> link to
// sign in. Signed in -> shadcn `Toggle` (toggleReaction): `aria-pressed`
// and the active style follow the `mine` state, as does the label
// (Soutenir / Soutenu).
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

  // Signed out: link to sign in (label + count), like report-button.
  if (!isAuthenticated) {
    return (
      <Link
        href="/connexion"
        className={cn(
          toggleVariants({ variant: 'outline', size: 'sm' }),
          'rounded-pill px-3.5',
        )}
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
      /* rejected (role/rate-limit): don't insist */
    } finally {
      setPending(false);
    }
  }

  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={mine}
      onPressedChange={() => void onClick()}
      disabled={pending || state === undefined}
      className="rounded-pill px-3.5"
    >
      <Thumb />
      <span>{mine ? t('reacted') : t('react')}</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span className="font-mono text-[12px]">
        {t('reactionsCount', { count })}
      </span>
    </Toggle>
  );
}
