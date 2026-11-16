'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import { CONTRIBUTION_MAX, CONTRIBUTION_MIN } from '@convex/lib/cercle';
import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextareaField } from '@/components/ui/field';
import { MemberPageHeader } from '@/components/member/page-header';
import { isRateLimited } from '@/lib/errors';
import { intlLocale } from '@/i18n/locale';

type Contribution = FunctionReturnType<
  typeof api.cercleContributions.list
>['page'][number];

const PAGE_SIZE = 20;

function Composer({ onSent }: { onSent: () => void }) {
  const t = useTranslations('cercle');
  const submit = useMutation(api.cercleContributions.submit);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(false);
    const trimmed = body.trim();
    if (trimmed.length < CONTRIBUTION_MIN) return setError(t('errBodyShort'));
    if (trimmed.length > CONTRIBUTION_MAX) return setError(t('errBodyLong'));
    setError(null);
    setPending(true);
    try {
      await submit({ body: trimmed });
      setBody('');
      setSent(true);
      onSent();
    } catch (err) {
      setError(isRateLimited(err) ? t('errRate') : t('errSend'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="cercle-write-title"
      className="mt-8 space-y-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="cercle-write-title" className="font-display text-xl text-ink">
        {t('writeTitle')}
      </h2>
      <TextareaField
        label={t('writeLabel')}
        hint={t('writeHint')}
        rows={6}
        value={body}
        error={error}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
      />
      <p className="text-xs text-muted">
        {t('writeCount', { count: body.trim().length, max: CONTRIBUTION_MAX })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t('writeSending') : t('writeSubmit')}
        </Button>
        <p role="status" className="text-sm text-accent-text">
          {sent ? t('feedbackSent') : ''}
        </p>
      </div>
    </form>
  );
}

function ContributionItem({
  item,
  onRemoved,
}: {
  item: Contribution;
  onRemoved: () => void;
}) {
  const t = useTranslations('cercle');
  const locale = useLocale();
  const remove = useMutation(api.cercleContributions.remove);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(item.createdAt),
    [locale, item.createdAt],
  );

  async function onRemove() {
    setPending(true);
    try {
      await remove({ contributionId: item._id });
      onRemoved();
    } catch (err) {
      // A contribution already gone is what the person wanted.
      if (!(err instanceof ConvexError && err.data === 'NOT_FOUND')) throw err;
      onRemoved();
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <p className="whitespace-pre-line wrap-anywhere leading-relaxed text-ink">
        {item.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {item.mine
            ? t('mineAuthor')
            : (item.authorName ?? t('anonymousAuthor'))}
          {' · '}
          {t('postedOn', { date })}
        </span>
        {item.mine ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            {t('remove')}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('removeTitle')}
        description={t('removeBody')}
        confirmLabel={t('confirmRemove')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={onRemove}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

function CercleSpace() {
  const t = useTranslations('cercle');
  // The list is live: a removed contribution leaves it at once, so the
  // confirmation lives here, not in the row that is gone.
  const [removedNotice, setRemovedNotice] = useState(false);
  const access = useQuery(api.cercle.access);
  const open = access !== undefined && access.level !== 'none';
  // Not asked for at all unless the server says the session is in the Cercle:
  // the server refuses the others anyway, this only avoids a pointless call.
  const { results, status, loadMore } = usePaginatedQuery(
    api.cercleContributions.list,
    open ? {} : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  if (access === undefined) return <AuthGateLoading />;

  if (!open) {
    return (
      <div className="max-w-3xl">
        <MemberPageHeader title={t('closedTitle')} lead={t('closedBody')} />
        <Button asChild className="mt-8 min-h-11">
          <Link href="/cercle">{t('closedCta')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <MemberPageHeader
        eyebrow={t('eyebrow')}
        title={t('spaceTitle')}
        lead={t('spaceIntro')}
      />
      <Composer onSent={() => setRemovedNotice(false)} />

      <section aria-labelledby="cercle-list-title" className="mt-10">
        <h2 id="cercle-list-title" className="font-display text-xl text-ink">
          {t('listTitle')}
        </h2>
        <p role="status" className="mt-2 text-sm text-accent-text">
          {removedNotice ? t('feedbackRemoved') : ''}
        </p>
        {status === 'LoadingFirstPage' ? (
          <p className="mt-4 text-ink-soft">…</p>
        ) : results.length === 0 ? (
          <p className="mt-4 text-ink-soft">{t('listEmpty')}</p>
        ) : (
          <ul aria-labelledby="cercle-list-title" className="mt-4 space-y-3">
            {results.map((item) => (
              <ContributionItem
                key={item._id}
                item={item}
                onRemoved={() => setRemovedNotice(true)}
              />
            ))}
          </ul>
        )}
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={status === 'LoadingMore'}
              onClick={() => loadMore(PAGE_SIZE)}
            >
              {t('more')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function CerclePage() {
  return (
    <AuthGate>
      <CercleSpace />
    </AuthGate>
  );
}
