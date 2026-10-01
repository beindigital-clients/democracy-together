'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';

// Follower / following counts of a profile page, LIVE.
//
// The page is rendered on the server: its counts froze at load, so following
// someone left "0 abonné" under the "Ne plus suivre" button that had just
// replaced "Suivre". This island subscribes to the same public read as the
// page and starts from the server's figures, so nothing flickers on arrival.
export function ProfileCounts({
  handle,
  followers,
  following,
}: {
  handle: string;
  followers: number;
  following: number;
}) {
  const t = useTranslations('profile');
  const live = useQuery(api.social.profiles.getByHandle, { handle });
  return (
    <p className="mt-4 text-sm text-muted" aria-live="polite">
      {t('counts', {
        followers: live?.followerCount ?? followers,
        following: live?.followingCount ?? following,
      })}
    </p>
  );
}
