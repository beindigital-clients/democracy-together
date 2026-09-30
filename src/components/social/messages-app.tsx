'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Search, SquarePen, X } from 'lucide-react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { fold } from '@convex/lib/directory';
import { Link, useRouter } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember } from '@/lib/roles';
import { dayKey } from '@/lib/message-thread';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ArrowBack } from '@/components/ui/arrow';
import { PersonAvatar } from './person-avatar';
import { MessageComposer } from './message-composer';
import { MESSAGES_BASE, MessageThread, errorCode } from './message-thread';

// PRIVATE MESSAGING — two panes, like the common messaging apps: the
// conversations on one side, the open conversation on the other. On a phone,
// the list fills the screen and a conversation opens full screen over it.
//
// Real-time by construction: each piece is a Convex query, so a received
// message appears in the thread, the list and the header badge without
// reloading.
//
// The URL carries the state (`?c=<conversation>`, `?to=<handle>` or
// `?new=1`): a notification link opens the right conversation directly, and
// the browser's "back" button returns to the list on mobile.

export function MessagesApp() {
  const t = useTranslations('messages');
  const params = useSearchParams();
  const me = useQuery(api.users.current);
  const mine = useQuery(api.social.profiles.getMine);
  const conversationId = params.get('c') as Id<'conversations'> | null;
  const to = params.get('to');
  const picking = params.get('new') === '1';

  if (me === undefined || mine === undefined) {
    return (
      <p role="status" className="text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (!me || !isMember(me.role)) {
    return <p className="text-ink-soft">{t('membersOnly')}</p>;
  }

  const selected = conversationId !== null || to !== null || picking;
  return (
    <div className="grid h-[calc(100dvh-10rem)] max-h-[52rem] min-h-[30rem] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(16rem,22rem)_1fr]">
      <div
        className={cn(
          'min-h-0 border-line md:border-e',
          selected ? 'hidden md:flex' : 'flex',
        )}
      >
        <ConversationList selectedId={conversationId} />
      </div>
      <div
        className={cn('h-full min-h-0', selected ? 'block' : 'hidden md:block')}
      >
        {conversationId ? (
          <MessageThread key={conversationId} conversationId={conversationId} />
        ) : to ? (
          <NewConversation
            key={to}
            handle={to}
            hasProfile={mine?.exists ?? false}
          />
        ) : picking ? (
          <RecipientPicker myHandle={mine?.handle ?? ''} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-pill bg-accent-tint text-accent-text">
              <SquarePen aria-hidden="true" className="size-7" />
            </span>
            <p className="max-w-xs text-ink-soft">{t('select')}</p>
            <Button asChild className="min-h-11">
              <Link href={`${MESSAGES_BASE}?new=1`}>{t('newMessage')}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationList({
  selectedId,
}: {
  selectedId: Id<'conversations'> | null;
}) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const items = useQuery(api.social.messages.listConversations);
  const [filter, setFilter] = useState('');
  // The clock, for "today" / "this week" in the time stamps.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const shown = useMemo(() => {
    const q = fold(filter.trim());
    if (!items || !q) return items;
    return items.filter((c) =>
      fold(c.other.displayName || t('unknownMember')).includes(q),
    );
  }, [items, filter, t]);

  const stamp = (at: number) => {
    const loc = intlLocale(locale);
    if (dayKey(at) === dayKey(now)) {
      return new Intl.DateTimeFormat(loc, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(at);
    }
    if (now - at < 6 * 24 * 60 * 60 * 1000) {
      return new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(at);
    }
    return new Intl.DateTimeFormat(loc, {
      day: 'numeric',
      month: 'short',
    }).format(at);
  };

  return (
    <section
      aria-labelledby="messages-liste"
      className="flex min-h-0 w-full flex-col"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 id="messages-liste" className="flex-1 font-display text-xl">
          {t('conversations')}
        </h2>
        <Link
          href={`${MESSAGES_BASE}?new=1`}
          className="inline-flex size-11 items-center justify-center rounded-pill text-accent-text hover:bg-accent-tint"
          aria-label={t('newMessage')}
          title={t('newMessage')}
        >
          <SquarePen aria-hidden="true" className="size-5" />
        </Link>
      </div>
      {items && items.length > 0 ? (
        <div className="relative px-3 pb-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-6 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Field label={t('filterLabel')} labelHidden>
            {(control) => (
              <input
                {...control}
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('filterPlaceholder')}
                className="min-h-10 w-full rounded-pill border border-line bg-paper ps-9 pe-3 text-sm text-ink placeholder:text-muted"
              />
            )}
          </Field>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown === undefined ? (
          <p role="status" className="px-4 py-3 text-ink-soft">
            {t('loading')}
          </p>
        ) : items?.length === 0 ? (
          <div className="px-4 py-6 text-sm text-ink-soft">
            <p>{t('empty')}</p>
            <Button asChild variant="outline" className="mt-3 min-h-11">
              <Link href={`${MESSAGES_BASE}?new=1`}>{t('newMessage')}</Link>
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-soft">{t('noMatch')}</p>
        ) : (
          <ul className="px-2 pb-2">
            {shown.map((c) => {
              const name = c.other.displayName || t('unknownMember');
              const active = c.conversationId === selectedId;
              const unread = c.unreadCount > 0;
              const preview = c.preview
                ? c.preview.removed
                  ? t('removed')
                  : c.preview.fromMe
                    ? t('you', { text: c.preview.text })
                    : c.preview.text
                : '';
              return (
                <li key={c.conversationId}>
                  <Link
                    href={`${MESSAGES_BASE}?c=${c.conversationId}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-md px-2 py-2.5 transition-colors',
                      active ? 'bg-accent-tint' : 'hover:bg-surface-2',
                    )}
                  >
                    <PersonAvatar
                      name={name}
                      photoUrl={c.other.photoUrl}
                      size={48}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-[15px] text-ink',
                            unread && 'font-semibold',
                          )}
                        >
                          {name}
                        </span>
                        <time
                          dateTime={new Date(c.lastMessageAt).toISOString()}
                          className={cn(
                            'shrink-0 text-[11px]',
                            unread
                              ? 'font-semibold text-accent-text'
                              : 'text-muted',
                          )}
                        >
                          {stamp(c.lastMessageAt)}
                        </time>
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            unread ? 'font-medium text-ink' : 'text-muted',
                          )}
                        >
                          <bdi>{c.blocked ? t('blockedPreview') : preview}</bdi>
                        </span>
                        {unread ? (
                          <span className="inline-flex min-w-5 shrink-0 justify-center rounded-pill bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-contrast">
                            <span aria-hidden="true">{c.unreadCount}</span>
                            <span className="sr-only">
                              {t('unread', { count: c.unreadCount })}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
        {t('privacyNote')}
      </p>
    </section>
  );
}

// "New message": find a member by name, then write to them. The search is
// the people directory's (same visibility rules, same bounded page).
function RecipientPicker({ myHandle }: { myHandle: string }) {
  const t = useTranslations('messages');
  const [q, setQ] = useState('');
  const needle = q.trim();
  const found = useQuery(
    api.social.profiles.search,
    needle.length >= 2 ? { q: needle } : 'skip',
  );
  const people = found?.items.filter((p) => p.handle !== myHandle) ?? [];
  return (
    <section
      aria-labelledby="messages-nouveau"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex items-center gap-2 border-b border-line px-2 py-2 sm:px-4">
        <Link
          href={MESSAGES_BASE}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink md:hidden"
        >
          <ArrowBack />
          <span className="sr-only">{t('back')}</span>
        </Link>
        <h2 id="messages-nouveau" className="flex-1 font-display text-lg">
          {t('newMessage')}
        </h2>
        <Link
          href={MESSAGES_BASE}
          className="hidden size-11 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink md:inline-flex"
          aria-label={t('cancel')}
        >
          <X aria-hidden="true" className="size-5" />
        </Link>
      </header>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span aria-hidden="true" className="text-sm text-muted">
          {t('toLabel')}
        </span>
        <Field label={t('toPlaceholder')} labelHidden className="flex-1">
          {(control) => (
            <input
              {...control}
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('toPlaceholder')}
              className="min-h-11 w-full bg-transparent text-[15px] text-ink placeholder:text-muted"
            />
          )}
        </Field>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {needle.length < 2 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">{t('toHint')}</p>
        ) : found === undefined ? (
          <p role="status" className="px-4 py-3 text-ink-soft">
            {t('loading')}
          </p>
        ) : people.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">{t('noPeople')}</p>
        ) : (
          <ul className="p-2">
            {people.map((p) => (
              <li key={p.handle}>
                <Link
                  href={`${MESSAGES_BASE}?to=${p.handle}`}
                  className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2"
                >
                  <PersonAvatar
                    name={p.displayName}
                    photoUrl={p.photoUrl}
                    size={40}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">
                      {p.displayName}
                    </span>
                    {p.jobTitle ? (
                      <span className="block truncate text-xs text-muted">
                        {p.jobTitle}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NewConversation({
  handle,
  hasProfile,
}: {
  handle: string;
  hasProfile: boolean;
}) {
  const t = useTranslations('messages');
  const router = useRouter();
  const profile = useQuery(api.social.profiles.getByHandle, { handle });
  const rel = useQuery(api.social.profiles.relationship, { handle });
  const start = useMutation(api.social.messages.startConversation);

  // A conversation already exists with this person: open it.
  const existing = rel?.conversationId ?? null;
  useEffect(() => {
    if (existing) router.replace(`${MESSAGES_BASE}?c=${existing}`);
  }, [existing, router]);

  if (profile === undefined || rel === undefined) {
    return (
      <p role="status" className="p-6 text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (!profile || !rel || rel.isSelf) {
    return <p className="p-6 text-ink-soft">{t('errors.NOT_FOUND')}</p>;
  }
  return (
    <section
      aria-labelledby="messages-nouveau"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex items-center gap-2 border-b border-line px-2 py-2 sm:px-4">
        <Link
          href={MESSAGES_BASE}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink md:hidden"
        >
          <ArrowBack />
          <span className="sr-only">{t('back')}</span>
        </Link>
        <PersonAvatar
          name={profile.displayName}
          photoUrl={profile.photoUrl}
          size={40}
        />
        <h2
          id="messages-nouveau"
          className="min-w-0 flex-1 truncate font-display text-lg"
        >
          {t('newTo', { name: profile.displayName })}
        </h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <PersonAvatar
          name={profile.displayName}
          photoUrl={profile.photoUrl}
          size={80}
        />
        <p className="font-display text-xl">{profile.displayName}</p>
        {profile.jobTitle ? (
          <p className="text-sm text-muted">{profile.jobTitle}</p>
        ) : null}
        <Link
          href={`/membres/${profile.handle}`}
          className="text-sm text-accent-text hover:underline"
        >
          {t('viewProfile')}
        </Link>
      </div>
      {hasProfile ? (
        <MessageComposer
          label={t('composerLabel')}
          autoFocus
          onSend={async (body) => {
            try {
              const id = await start({ userId: rel.userId, body });
              router.replace(`${MESSAGES_BASE}?c=${id}`);
            } catch (err) {
              throw new Error(
                vocabulary(t, 'errors.', errorCode(err), t('errors.generic')),
                { cause: err },
              );
            }
          }}
        />
      ) : (
        <div className="border-t border-line bg-accent-tint p-4 text-center">
          <p className="text-sm text-ink-soft">{t('profileRequired')}</p>
          <Button asChild className="mt-3 min-h-11">
            <Link href="/espace-membre/profil">{t('profileCta')}</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
