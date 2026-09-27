'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { isRateLimited } from '@/lib/errors';
import { TribuneComposer } from './tribune-composer';

// APPROFONDISSEMENT (F-48) — îlot client sous un billet publié.
//
// Ce que le serveur autorise, et rien d'autre (`deepeningState`) :
//   - l'auteur d'un billet court, ou un membre qu'il a invité, ouvre une
//     contribution de fond liée (elle passe par la modération) ;
//   - l'auteur invite un membre par son adresse (sans apprendre si elle
//     correspond à un compte) ;
//   - l'auteur d'une contribution de fond publiée la propose à la
//     bibliothèque, où la modération éditoriale décide.
// Un visiteur anonyme ne voit rien : l'état rendu est vide, sans erreur.
export function DeepenPanel({
  postId,
  title,
  theme,
}: {
  postId: Id<'tribunePosts'>;
  title: string;
  theme: string;
}) {
  const t = useTranslations('tribune');
  const state = useQuery(api.tribune.deepeningState, { postId });
  const invite = useMutation(api.tribune.inviteDeepening);
  const revoke = useMutation(api.tribune.revokeDeepeningInvite);
  const propose = useMutation(api.tribune.proposeToLibrary);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!state) return null;
  const { canDeepen, isAuthor, invites, canProposeToLibrary } = state;
  if (
    !canDeepen &&
    !canProposeToLibrary &&
    !(state.proposedToLibrary && isAuthor)
  )
    return null;

  function message(err: unknown): string {
    if (isRateLimited(err)) return t('rateLimited');
    const code =
      err instanceof ConvexError && typeof err.data === 'string'
        ? err.data
        : null;
    if (code === 'INVALID_EMAIL' || code === 'INVALID_INVITEE')
      return t('errInviteEmail');
    return t('errGeneric');
  }

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await invite({ postId, email: email.trim() });
      setStatus(t('deepenInviteSent', { email: email.trim() }));
      setEmail('');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPropose() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await propose({ postId });
      setStatus(t('libraryProposed'));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="tr-deepen-title"
      className="mt-8 space-y-4 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="tr-deepen-title" className="font-display text-lg">
        {canDeepen ? t('deepenTitle') : t('libraryTitle')}
      </h2>

      {canDeepen ? (
        <>
          <p className="text-sm text-ink-soft">{t('deepenLead')}</p>
          <TribuneComposer parent={{ id: postId, title, theme }} />
        </>
      ) : null}

      {canDeepen && isAuthor ? (
        <form
          onSubmit={onInvite}
          noValidate
          className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <TextField
            label={t('deepenInviteLabel')}
            id="tr-deepen-invite"
            type="email"
            autoComplete="off"
            value={email}
            hint={t('deepenInviteHint')}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="min-h-11" disabled={busy}>
            {t('deepenInviteSubmit')}
          </Button>
        </form>
      ) : null}

      {isAuthor && invites.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {invites.map((i) => (
            <li
              key={i._id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="wrap-anywhere text-ink-soft">{i.email}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => revoke({ inviteId: i._id })}
              >
                {t('deepenInviteRevoke')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {canProposeToLibrary ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">{t('libraryLead')}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={onPropose}
          >
            {t('libraryPropose')}
          </Button>
        </div>
      ) : state.proposedToLibrary && isAuthor ? (
        <p className="text-sm text-ink-soft">{t('libraryAlreadyProposed')}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-bar-5">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-ink">
          {status}
        </p>
      ) : null}
    </section>
  );
}
