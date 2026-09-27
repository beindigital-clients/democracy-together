'use client';

import { useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isRateLimited } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Boutons « suivre / écrire / bloquer » d'une page de profil. Îlot client
// posé dans une page SERVEUR (indexable) : rien ne s'affiche pour un visiteur
// anonyme, et la relation vient de Convex (`social.profiles.relationship`),
// qui rend `null` dès que le lecteur n'a pas le droit de voir le profil.
export function ProfileActions({
  handle,
  displayName,
}: {
  handle: string;
  displayName: string;
}) {
  const t = useTranslations('people');
  const { isAuthenticated } = useConvexAuth();
  const rel = useQuery(
    api.social.profiles.relationship,
    isAuthenticated ? { handle } : 'skip',
  );
  const follow = useMutation(api.social.follows.follow);
  const unfollow = useMutation(api.social.follows.unfollow);
  const block = useMutation(api.social.messages.block);
  const unblock = useMutation(api.social.messages.unblock);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!rel) return null;

  if (rel.isSelf) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-soft">{t('profile.self')}</p>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/espace-membre/profil">{t('profile.edit')}</Link>
        </Button>
      </div>
    );
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        isRateLimited(err) ? t('actions.rateLimited') : t('actions.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!rel.viewerIsMember) {
    return <p className="text-sm text-muted">{t('actions.needMember')}</p>;
  }

  const userId = rel.userId;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {rel.followsMe ? (
          <span className="rounded-pill border border-line-strong px-3 py-1 text-xs text-ink-soft">
            {t('actions.followsYou')}
          </span>
        ) : null}
        {rel.blockedByMe ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => run(() => unblock({ userId }))}
          >
            {t('actions.unblock')}
          </Button>
        ) : rel.viewerHasProfile ? (
          <>
            {rel.following ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                aria-pressed="true"
                onClick={() => run(() => unfollow({ userId }))}
              >
                {t('actions.unfollow')}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11"
                disabled={busy}
                onClick={() => run(() => follow({ userId }))}
              >
                {t('actions.follow')}
              </Button>
            )}
            <Button asChild variant="outline" className="min-h-11">
              <Link
                href={
                  rel.conversationId
                    ? `/espace-membre/messages?c=${rel.conversationId}`
                    : `/espace-membre/messages?to=${encodeURIComponent(handle)}`
                }
              >
                {rel.conversationId
                  ? t('actions.openConversation')
                  : t('actions.write')}
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() => setConfirmBlock(true)}
            >
              {t('actions.block')}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted">
            {t('actions.needProfile')}{' '}
            <Link
              href="/espace-membre/profil"
              className="text-accent-text underline"
            >
              {t('profile.edit')}
            </Link>
          </p>
        )}
      </div>
      <p role="status" className="mt-2 text-sm text-bar-5">
        {error}
      </p>
      <ConfirmDialog
        open={confirmBlock}
        title={t('actions.blockConfirmTitle', { name: displayName })}
        description={t('actions.blockConfirmBody')}
        confirmLabel={t('actions.blockConfirm')}
        cancelLabel={t('actions.cancel')}
        destructive
        pending={busy}
        onCancel={() => setConfirmBlock(false)}
        onConfirm={() =>
          run(async () => {
            await block({ userId });
            setConfirmBlock(false);
          })
        }
      />
    </div>
  );
}
