'use client';

import { useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

// "Suivre cette organisation" on the directory page. Nothing for an
// anonymous visitor or for an account that is not a network member: the page
// stays public, the button only appears there if it can be of use.
export function OrgFollowButton({ orgId }: { orgId: Id<'organizations'> }) {
  const t = useTranslations('people');
  const { isAuthenticated } = useConvexAuth();
  const state = useQuery(
    api.social.follows.orgFollowState,
    isAuthenticated ? { orgId } : 'skip',
  );
  const setFollow = useMutation(api.social.follows.setOrgFollow);
  const [busy, setBusy] = useState(false);
  if (!state?.canFollow) return null;
  return (
    <Button
      type="button"
      variant={state.following ? 'outline' : 'default'}
      className="min-h-11 w-full"
      aria-pressed={state.following}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setFollow({ orgId, follow: !state.following });
        } finally {
          setBusy(false);
        }
      }}
    >
      {state.following ? t('org.unfollow') : t('org.follow')}
    </Button>
  );
}
