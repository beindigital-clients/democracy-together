'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { isInvitationExpired } from '@convex/lib/communaute';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { intlLocale } from '@/i18n/locale';
import { useWorkspaceError } from './workspace-errors';
import { useRoleLabel } from './workspace-manage';

// INVITATIONS REÇUES (F-24). L'échéance est calculée ICI, à l'affichage : le
// serveur ne réécrit pas le statut d'une invitation échue (une query ne lit
// pas l'horloge), il REFUSE de l'accepter. L'écran le dit avant le clic.
export function MyInvitations({
  workspaceId,
}: {
  // Restreint aux invitations d'un espace (fiche d'un espace privé).
  workspaceId?: Id<'workspaces'>;
}) {
  const t = useTranslations('workspaces');
  const roleLabel = useRoleLabel();
  const locale = intlLocale(useLocale());
  const router = useRouter();
  const all = useQuery(api.workspaces.myInvitations, {});
  const respond = useMutation(api.workspaces.respondInvitation);
  const errorMessage = useWorkspaceError();
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNow(Date.now()), []);

  const items = (all ?? []).filter(
    (i) => !workspaceId || i.workspaceId === workspaceId,
  );
  if (all === undefined || items.length === 0) return null;

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function answer(
    invitationId: Id<'workspaceInvitations'>,
    accept: boolean,
  ) {
    setBusy(invitationId);
    setError(null);
    try {
      const res = await respond({ invitationId, accept });
      if (accept) router.push(`/espaces/${res.workspaceId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="ws-invitations-title"
      className="rounded-md border border-accent-edge bg-accent-tint p-5"
    >
      <h2 id="ws-invitations-title" className="font-display text-xl text-ink">
        {t('invitationsTitle')}
      </h2>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-bar-5">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((i) => {
          const expired = now !== null && isInvitationExpired(i.expiresAt, now);
          return (
            <li
              key={i._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                {workspaceId ? (
                  <p className="wrap-anywhere font-medium text-ink">
                    {i.workspaceTitle}
                  </p>
                ) : (
                  <Link
                    href={`/espaces/${i.workspaceId}`}
                    className="wrap-anywhere font-medium text-accent-text hover:underline"
                  >
                    {i.workspaceTitle}
                  </Link>
                )}
                <p className="mt-1 text-[13px] text-ink-soft">
                  {t('invitationFrom', {
                    name: i.invitedByName,
                    role: roleLabel(i.role),
                  })}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">
                  {expired
                    ? t('invitationExpired')
                    : t('invitationExpires', { date: fmtDate(i.expiresAt) })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={expired || busy === i._id}
                  onClick={() => answer(i._id, true)}
                  aria-label={t('acceptNamed', { title: i.workspaceTitle })}
                >
                  {t('accept')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy === i._id}
                  onClick={() => answer(i._id, false)}
                  aria-label={t('declineNamed', { title: i.workspaceTitle })}
                >
                  {t('decline')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
