'use client';

import { useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TRIBUNE_BODY } from '@convex/lib/validation';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { isRateLimited } from '@/lib/errors';
import { STATUS_PILL } from '@/components/tribune/my-posts';

// APERÇU D'UNE CONTRIBUTION par son auteur (F-45) — quel que soit son état.
// La page publique ne sert qu'un billet en ligne ; ici l'auteur relit un texte
// en attente ou rejeté, lit le motif d'un rejet, et le CORRIGE : un billet
// corrigé repart en file de modération. Tout autre compte reçoit
// « introuvable » (le serveur ne rend le billet qu'à son auteur).
function OwnPost({ postId }: { postId: string }) {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const locale = intlLocale(useLocale());
  const post = useQuery(api.tribune.getOwnPost, { postId });
  const update = useMutation(api.tribune.updatePost);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (post === undefined) return <AuthGateLoading className="max-w-3xl" />;
  if (post === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-ink-soft">{t('ownNotFound')}</p>
        <Link
          href="/espace-membre/contributions"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline"
        >
          {t('contributionsTitle')}
        </Link>
      </div>
    );
  }

  const editable = post.status === 'pending' || post.status === 'rejected';
  const bounds = TRIBUNE_BODY[post.format];
  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 4) return setError(t('errTitle'));
    if (body.trim().length < bounds.min) return setError(t('errBody'));
    if (body.trim().length > bounds.max)
      return setError(t('errBodyTooLong', { max: bounds.max }));
    setPending(true);
    try {
      await update({
        postId: postId as Id<'tribunePosts'>,
        title: title.trim(),
        body: body.trim(),
      });
      setEditing(false);
      setStatus(t('resubmitted'));
    } catch (err) {
      const code =
        err instanceof ConvexError && typeof err.data === 'string'
          ? err.data
          : null;
      setError(
        isRateLimited(err)
          ? t('rateLimited')
          : code === 'BODY_TOO_LONG'
            ? t('errBodyTooLong', { max: bounds.max })
            : t('errGeneric'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-[13px] text-muted">
        <Link href="/espace-membre" className="text-muted hover:text-ink">
          {t('memberSpace')}
        </Link>{' '}
        /{' '}
        <Link
          href="/espace-membre/contributions"
          className="text-muted hover:text-ink"
        >
          {t('contributionsTitle')}
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span
          className={`rounded-pill border px-2.5 py-0.5 font-medium ${STATUS_PILL[post.status]}`}
        >
          {vocabulary(t, 'status_', post.status)}
        </span>
        <span className="font-mono text-muted">
          {vocabulary(tl, 'themes.', post.theme)} ·{' '}
          {vocabulary(t, 'format_', post.format)} · {fmtDate(post.createdAt)}
        </span>
      </div>
      <h1 className="mt-3 wrap-anywhere font-display text-[clamp(26px,3.4vw,38px)] font-medium leading-tight">
        {post.title}
      </h1>
      {post.parent ? (
        <p className="mt-2 text-sm text-ink-soft">
          {t('deepensLabel')}{' '}
          <Link
            href={`/tribune/${post.parent._id}`}
            className="wrap-anywhere font-semibold text-accent-text hover:underline"
          >
            {post.parent.title}
          </Link>
        </p>
      ) : null}

      <p className="mt-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
        {post.status === 'pending'
          ? t('ownPendingNote')
          : post.status === 'rejected'
            ? t('ownRejectedNote')
            : post.status === 'removed'
              ? t('ownRemovedNote')
              : t('ownPublishedNote')}
      </p>
      {post.rejectionReason ? (
        <p className="mt-3 wrap-anywhere rounded-md border border-bar-5 px-4 py-3 text-sm text-ink">
          {t('reasonLabel', { reason: post.rejectionReason })}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {status}
        </p>
      ) : null}

      {editing ? (
        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-6 space-y-4 rounded-md border border-line bg-surface p-5"
        >
          <TextField
            label={t('fieldTitle')}
            id="own-title"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextareaField
            label={t('fieldBody')}
            id="own-body"
            value={body}
            rows={post.format === 'fond' ? 12 : 6}
            maxLength={bounds.max}
            hint={
              <span className="wrap-anywhere">
                {t('bodyCount', { count: body.length, max: bounds.max })}
              </span>
            }
            onChange={(e) => setBody(e.target.value)}
          />
          <FormError>{error}</FormError>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={pending}>
              {t('resubmit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setEditing(false)}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-6 whitespace-pre-line wrap-anywhere text-[17px] leading-relaxed text-ink-soft">
            {post.body}
          </div>
          {editable ? (
            <Button
              type="button"
              className="mt-6 min-h-11"
              onClick={() => {
                setTitle(post.title);
                setBody(post.body);
                setStatus(null);
                setEditing(true);
              }}
            >
              {t('editContribution')}
            </Button>
          ) : null}
        </>
      )}
    </article>
  );
}

function Loader() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <AuthGateLoading className="max-w-3xl" />;
  return <OwnPost postId={id} />;
}

export default function OwnContributionPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Loader />
    </AuthGate>
  );
}
