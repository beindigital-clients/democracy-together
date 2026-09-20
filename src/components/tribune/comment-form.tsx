'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { isMember } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/field';
import { Link, useRouter } from '@/i18n/navigation';

// Commentaire (F-47) — réservé aux membres. Rafraîchit le détail après envoi.
export function CommentForm({ postId }: { postId: string }) {
  const t = useTranslations('tribune');
  const me = useQuery(api.users.current);
  const add = useMutation(api.tribune.addComment);
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (body.trim().length < 2) return;
    setPending(true);
    try {
      await add({ postId: postId as Id<'tribunePosts'>, body: body.trim() });
      setBody('');
      router.refresh();
    } catch {
      /* refusé (rôle/rate-limit) : on n'insiste pas */
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
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        required
        placeholder={t('commentPlaceholder')}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {t('commentSubmit')}
      </Button>
    </form>
  );
}
