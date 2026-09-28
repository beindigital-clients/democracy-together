'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TRIBUNE_COMMENT } from '@convex/lib/validation';
import { isMember } from '@/lib/roles';
import { isRateLimited } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/field';
import { Link, useRouter } from '@/i18n/navigation';

// Comment (F-47) — reserved for members. Refreshes the detail after sending.
export function CommentForm({ postId }: { postId: string }) {
  const t = useTranslations('tribune');
  const me = useQuery(api.users.current);
  const add = useMutation(api.tribune.addComment);
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Comment held for approval (pre-moderation mode for comments):
  // the author must know it has not disappeared.
  const [held, setHeld] = useState(false);

  if (me === undefined) return null;
  if (!isMember(me?.role)) {
    return (
      <p className="text-sm text-ink-soft">
        {t('commentMembersOnly')}{' '}
        <Link
          href="/connexion"
          className="font-semibold text-accent-text hover:underline"
        >
          {t('signInCta')}
        </Link>
      </p>
    );
  }

  const { min, max } = TRIBUNE_COMMENT;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // A one-character comment did NOTHING, and 4,001 characters
    // were silently rejected by the server, text kept (measured on
    // 27/09, A-06). Each rejection now has its message, below the field.
    const text = body.trim();
    if (text.length < min) {
      setError(t('errCommentShort', { min }));
      return;
    }
    if (text.length > max) {
      setError(t('errCommentLong', { max }));
      return;
    }
    setPending(true);
    setHeld(false);
    try {
      const res = await add({
        postId: postId as Id<'tribunePosts'>,
        body: text,
      });
      setBody('');
      setHeld(res.status === 'pending');
      router.refresh();
    } catch (err) {
      const code =
        err instanceof ConvexError && typeof err.data === 'string'
          ? err.data
          : null;
      setError(
        isRateLimited(err)
          ? t('commentRateLimited')
          : code === 'INVALID_COMMENT'
            ? t('errCommentRange', { min, max })
            : t('errCommentGeneric'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2">
      <TextareaField
        label={t('commentLabel')}
        labelHidden
        id="tr-comment"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
        }}
        rows={3}
        required
        // Same limit as `convex/tribune.ts#addComment` (A-06).
        maxLength={max}
        hint={
          <span className="wrap-anywhere">
            {t('bodyCount', { count: body.length, max })}
          </span>
        }
        error={error}
        placeholder={t('commentPlaceholder')}
      />
      <Button type="submit" size="sm" className="min-h-11" disabled={pending}>
        {t('commentSubmit')}
      </Button>
      {held ? (
        <p role="status" className="text-sm text-ink">
          {t('commentPending')}
        </p>
      ) : null}
    </form>
  );
}
