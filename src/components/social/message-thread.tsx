'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { optimisticallyUpdateValueInPaginatedQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowDown,
  Ban,
  Copy,
  EllipsisVertical,
  Flag,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import {
  MESSAGE_REACTIONS,
  REPORT_REASON_MAX,
  canEditMessage,
} from '@convex/lib/social';
import { Link, useRouter } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextareaField } from '@/components/ui/field';
import { ArrowBack } from '@/components/ui/arrow';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildThreadItems, dayKey } from '@/lib/message-thread';
import { cn } from '@/lib/utils';
import { PersonAvatar } from './person-avatar';
import { MessageComposer, type ComposerContext } from './message-composer';

// ONE CONVERSATION, the way the common messaging apps show it: bubbles
// grouped by sender, day dividers, a "new messages" divider, "Seen" under my
// latest message, the other person's "is typing…", replies, reactions and
// corrections. Older messages load as the reader scrolls up.
//
// Everything is a Convex subscription: a message, a reaction or a read
// arrives without reloading.

export const MESSAGES_BASE = '/espace-membre/messages';
const PAGE = 30;
// Within this distance of the bottom, the thread follows new messages.
const STICK_PX = 120;

type Message = FunctionReturnType<
  typeof api.social.messages.listMessages
>['page'][number];

type Pending = {
  key: string;
  body: string;
  replyToId?: Id<'directMessages'>;
  failed: boolean;
};

export function errorCode(err: unknown): string {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : 'generic';
}

export function MessageThread({
  conversationId,
}: {
  conversationId: Id<'conversations'>;
}) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
  const thread = useQuery(api.social.messages.getConversation, {
    conversationId,
  });
  const { results, status, loadMore } = usePaginatedQuery(
    api.social.messages.listMessages,
    { conversationId },
    { initialNumItems: PAGE },
  );
  const typing = useQuery(api.social.messages.typingState, { conversationId });

  const markRead = useMutation(api.social.messages.markRead);
  const send = useMutation(api.social.messages.sendMessage);
  const edit = useMutation(api.social.messages.editMessage);
  const setTyping = useMutation(api.social.messages.setTyping);
  const react = useMutation(
    api.social.messages.reactToMessage,
  ).withOptimisticUpdate((store, { messageId, emoji }) => {
    optimisticallyUpdateValueInPaginatedQuery(
      store,
      api.social.messages.listMessages,
      { conversationId },
      (m) =>
        m._id !== messageId
          ? m
          : {
              ...m,
              reactions: [
                ...m.reactions.filter((r) => !r.mine),
                ...(emoji ? [{ emoji, mine: true }] : []),
              ],
            },
    );
  });
  const deleteMessage = useMutation(
    api.social.messages.deleteMessage,
  ).withOptimisticUpdate((store, { messageId }) => {
    // Removed from MY copy: it can leave the screen at once.
    const pages = store.getAllQueries(api.social.messages.listMessages);
    for (const { args, value } of pages) {
      if (!value || args.conversationId !== conversationId) continue;
      store.setQuery(api.social.messages.listMessages, args, {
        ...value,
        page: value.page.filter((m) => m._id !== messageId),
      });
    }
  });
  const deleteConversation = useMutation(
    api.social.messages.deleteConversation,
  );
  const block = useMutation(api.social.messages.block);
  const unblock = useMutation(api.social.messages.unblock);

  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);
  const [reporting, setReporting] = useState<Id<'directMessages'> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [context, setContext] = useState<
    | { kind: 'reply'; message: Message }
    | { kind: 'edit'; message: Message }
    | null
  >(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingSeq = useRef(0);
  const [selected, setSelected] = useState<Id<'directMessages'> | null>(null);

  // The clock drives what depends on time: the correction window, "Today".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // "Is typing…" fades by itself when the signal expires.
  const typingUntil = typing?.until ?? 0;
  const [typingShown, setTypingShown] = useState(false);
  useEffect(() => {
    const left = typingUntil - Date.now();
    setTypingShown(left > 0);
    if (left <= 0) return;
    const id = setTimeout(() => setTypingShown(false), left);
    return () => clearTimeout(id);
  }, [typingUntil]);

  // Where the "new messages" divider goes: the read instant WHEN THE THREAD
  // OPENED (reading moves it right after), dropped once I answer.
  const [unreadAfter, setUnreadAfter] = useState<number | null>(null);
  const unreadCaptured = useRef(false);
  useEffect(() => {
    if (!thread || unreadCaptured.current) return;
    unreadCaptured.current = true;
    if (thread.unreadCount > 0) setUnreadAfter(thread.myLastReadAt);
  }, [thread]);

  const unread = thread?.unreadCount ?? 0;
  // Opening the thread counts as reading — and so does each message received
  // while the thread is open.
  useEffect(() => {
    if (unread > 0) void markRead({ conversationId }).catch(() => undefined);
  }, [unread, conversationId, markRead]);

  // --- Scrolling ------------------------------------------------------------
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const anchor = useRef<{ height: number; top: number } | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    setAtBottom(bottom);
    if (bottom) setNewBelow(0);
  }, []);

  const loadOlder = useCallback(() => {
    if (status !== 'CanLoadMore') return;
    const el = scroller.current;
    if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    loadMore(PAGE);
  }, [status, loadMore]);

  // Older messages load when the top of the thread comes into view.
  useEffect(() => {
    const el = topSentinel.current;
    const root = scroller.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadOlder();
      },
      { root, rootMargin: '200px 0px 0px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadOlder]);

  // Older page added ABOVE: keep what the reader was looking at in place.
  const oldestId = results[results.length - 1]?._id;
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollTop = el.scrollHeight - a.height + a.top;
    anchor.current = null;
  }, [oldestId]);

  // A new message BELOW: follow it if the reader is at the bottom or if it
  // is mine, otherwise count it on the "down" button.
  const newest = results[0];
  const newestId = newest?._id;
  const firstPaint = useRef(true);
  useLayoutEffect(() => {
    if (!newestId) return;
    if (firstPaint.current) {
      firstPaint.current = false;
      scrollToBottom();
      return;
    }
    if (atBottom || newest?.fromMe) scrollToBottom();
    else setNewBelow((n) => n + 1);
    // `atBottom` and `newest` are read at the time the id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId, scrollToBottom]);

  useLayoutEffect(() => {
    if (atBottom) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingShown, pending.length, scrollToBottom]);

  const ordered = useMemo(() => [...results].reverse(), [results]);
  const items = useMemo(
    () =>
      buildThreadItems(ordered, {
        unreadAfter,
        otherLastReadAt: thread?.otherLastReadAt ?? 0,
      }),
    [ordered, unreadAfter, thread?.otherLastReadAt],
  );

  if (thread === undefined) {
    return (
      <p role="status" className="p-6 text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (thread === null) {
    return <p className="p-6 text-ink-soft">{t('errors.NOT_FOUND')}</p>;
  }

  const name = thread.other.displayName || t('unknownMember');
  const fmtTime = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmtFull = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const dayLabel = (at: number) => {
    const key = dayKey(at);
    if (key === dayKey(now)) return t('today');
    if (key === dayKey(now - 24 * 60 * 60 * 1000)) return t('yesterday');
    return new Intl.DateTimeFormat(intlLocale(locale), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(new Date(at).getFullYear() !== new Date(now).getFullYear()
        ? { year: 'numeric' as const }
        : {}),
    }).format(at);
  };

  function translated(err: unknown): Error {
    return new Error(
      vocabulary(t, 'errors.', errorCode(err), t('errors.generic')),
      { cause: err },
    );
  }

  async function sendBody(body: string, replyToId?: Id<'directMessages'>) {
    const key = `p-${(pendingSeq.current += 1)}`;
    setPending((p) => [...p, { key, body, replyToId, failed: false }]);
    try {
      // The real message reaches the subscription BEFORE the promise
      // resolves: the pending bubble is replaced without a blink.
      await send({ conversationId, body, replyToId });
      setPending((p) => p.filter((x) => x.key !== key));
    } catch (err) {
      setPending((p) =>
        p.map((x) => (x.key === key ? { ...x, failed: true } : x)),
      );
      throw translated(err);
    }
  }

  async function onSend(body: string) {
    setUnreadAfter(null);
    const ctx = context;
    setContext(null);
    if (ctx?.kind === 'edit') {
      try {
        await edit({ messageId: ctx.message._id, body });
      } catch (err) {
        setContext(ctx);
        throw translated(err);
      }
      return;
    }
    try {
      await sendBody(body, ctx?.kind === 'reply' ? ctx.message._id : undefined);
    } catch (err) {
      if (ctx) setContext(ctx);
      throw err;
    }
  }

  const composerContext: ComposerContext | null =
    context?.kind === 'reply'
      ? {
          kind: 'reply',
          label: context.message.fromMe
            ? t('replyingToSelf')
            : t('replyingTo', { name }),
          excerpt: context.message.body,
        }
      : context?.kind === 'edit'
        ? { kind: 'edit', body: context.message.body }
        : null;

  function jumpTo(id: Id<'directMessages'>) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.dataset.flash = 'true';
    setTimeout(() => delete el.dataset.flash, 1200);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t('copied'));
    } catch {
      setNotice(t('errors.generic'));
    }
  }

  return (
    <section
      aria-labelledby="messages-fil"
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
        <PersonAvatar name={name} photoUrl={thread.other.photoUrl} size={40} />
        <div className="min-w-0 flex-1">
          <h2
            id="messages-fil"
            className="truncate font-display text-lg leading-tight"
          >
            {thread.other.handle ? (
              <Link
                href={`/membres/${thread.other.handle}`}
                className="hover:underline"
              >
                <span className="sr-only">{t('with', { name })}</span>
                <span aria-hidden="true">{name}</span>
              </Link>
            ) : (
              <>
                <span className="sr-only">{t('with', { name })}</span>
                <span aria-hidden="true">{name}</span>
              </>
            )}
          </h2>
          <p className="h-4 truncate text-xs text-muted" aria-live="polite">
            {typingShown ? (
              <span className="text-accent-text">{t('typing', { name })}</span>
            ) : thread.blockedByMe ? (
              t('blockedByMe')
            ) : null}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink"
              aria-label={t('conversationMenu')}
            >
              <EllipsisVertical aria-hidden="true" className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {thread.other.handle ? (
              <DropdownMenuItem asChild>
                <Link href={`/membres/${thread.other.handle}`}>
                  <UserRound aria-hidden="true" className="size-4" />
                  {t('viewProfile')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {thread.blockedByMe ? (
              <DropdownMenuItem
                onSelect={() => void unblock({ userId: thread.otherUserId })}
              >
                <Ban aria-hidden="true" className="size-4" />
                {t('unblock')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setConfirm('block')}>
                <Ban aria-hidden="true" className="size-4" />
                {t('block')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-bar-5"
              onSelect={() => setConfirm('delete')}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t('deleteConversation')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain px-2 py-3 sm:px-4"
          // Scrollable region reachable by keyboard (RGAA / axe).
          tabIndex={0}
          aria-label={t('threadLabel', { name })}
        >
          <div ref={topSentinel} aria-hidden="true" />
          {status === 'CanLoadMore' ? (
            <p className="mb-3 text-center">
              <button
                type="button"
                className="min-h-11 rounded-pill px-4 text-xs text-accent-text hover:bg-accent-tint"
                onClick={loadOlder}
              >
                {t('loadOlder')}
              </button>
            </p>
          ) : status === 'LoadingMore' || status === 'LoadingFirstPage' ? (
            <p role="status" className="mb-3 text-center text-xs text-muted">
              {t('loading')}
            </p>
          ) : results.length > 0 ? (
            <p className="mx-auto mb-4 max-w-sm text-center text-xs leading-relaxed text-muted">
              {t('threadStart')}
            </p>
          ) : null}

          <ol
            role="log"
            aria-label={t('messagesLabel')}
            className="flex flex-col"
          >
            {items.map((item) => {
              if (item.kind === 'day') {
                return (
                  <li
                    key={item.key}
                    className="my-3 flex justify-center"
                    aria-label={dayLabel(item.at)}
                  >
                    <span className="rounded-pill bg-surface-2 px-3 py-1 text-[11px] font-medium text-ink-soft first-letter:uppercase">
                      {dayLabel(item.at)}
                    </span>
                  </li>
                );
              }
              if (item.kind === 'unread') {
                return (
                  <li
                    key={item.key}
                    className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-accent-text"
                  >
                    <span className="h-px flex-1 bg-accent-edge" />
                    {t('newMessages')}
                    <span className="h-px flex-1 bg-accent-edge" />
                  </li>
                );
              }
              const m = item.message;
              return (
                <Bubble
                  key={item.key}
                  message={m}
                  first={item.first}
                  last={item.last}
                  status={item.status}
                  otherName={name}
                  otherPhoto={thread.other.photoUrl}
                  time={fmtTime.format(m.createdAt)}
                  fullTime={fmtFull.format(m.createdAt)}
                  editable={
                    thread.refusal === null &&
                    canEditMessage({
                      fromMe: m.fromMe,
                      removed: m.removed,
                      createdAt: m.createdAt,
                      now,
                    })
                  }
                  canInteract={thread.refusal === null}
                  selected={selected === m._id}
                  onSelect={() =>
                    setSelected((s) => (s === m._id ? null : m._id))
                  }
                  onReact={(emoji) =>
                    void react({ messageId: m._id, emoji }).catch((err) =>
                      setNotice(translated(err).message),
                    )
                  }
                  onReply={() => setContext({ kind: 'reply', message: m })}
                  onEdit={() => setContext({ kind: 'edit', message: m })}
                  onCopy={() => void copy(m.body)}
                  onDelete={() =>
                    void deleteMessage({ messageId: m._id }).catch((err) =>
                      setNotice(translated(err).message),
                    )
                  }
                  onReport={() => setReporting(m._id)}
                  onJump={jumpTo}
                />
              );
            })}
            {pending.map((p) => (
              <li key={p.key} className="mt-2 flex flex-col items-end">
                <div
                  className={cn(
                    'max-w-[78%] whitespace-pre-wrap rounded-[1.25rem] bg-accent px-3.5 py-2 text-[15px] leading-snug text-accent-contrast wrap-anywhere',
                    p.failed ? 'opacity-60' : 'opacity-70',
                  )}
                >
                  <span dir="auto">{p.body}</span>
                </div>
                <p className="mt-1 px-2 text-[11px] text-muted">
                  {p.failed ? (
                    <span className="text-bar-5">
                      {t('failed')}{' '}
                      <button
                        type="button"
                        className="min-h-8 underline underline-offset-2"
                        onClick={() => {
                          setPending((all) =>
                            all.filter((x) => x.key !== p.key),
                          );
                          void sendBody(p.body, p.replyToId).catch(
                            () => undefined,
                          );
                        }}
                      >
                        {t('retry')}
                      </button>
                    </span>
                  ) : (
                    t('sending')
                  )}
                </p>
              </li>
            ))}
          </ol>

          {typingShown ? (
            <div className="mt-2 flex items-end gap-2" aria-hidden="true">
              <PersonAvatar
                name={name}
                photoUrl={thread.other.photoUrl}
                size={28}
              />
              <div className="flex gap-1 rounded-[1.25rem] bg-surface-2 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-2 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {!atBottom ? (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-3 end-4 inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line bg-paper px-3 text-sm text-ink shadow-md hover:bg-surface-2"
          >
            <ArrowDown aria-hidden="true" className="size-4" />
            {newBelow > 0 ? t('newBelow', { count: newBelow }) : t('toLatest')}
          </button>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {notice}
      </p>
      {notice ? (
        <p className="border-t border-line px-4 py-1.5 text-xs text-ink-soft">
          {notice}
        </p>
      ) : null}

      {thread.refusal ? (
        <p className="border-t border-line bg-surface-2 p-4 text-center text-sm text-ink-soft">
          {vocabulary(t, 'refusal.', thread.refusal)}
        </p>
      ) : (
        <MessageComposer
          label={t('composerLabel')}
          context={composerContext}
          onCancelContext={() => setContext(null)}
          onSend={onSend}
          onTyping={(on) =>
            void setTyping({ conversationId, typing: on }).catch(
              () => undefined,
            )
          }
        />
      )}

      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('deleteConversationTitle')}
        description={t('deleteConversationBody')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await deleteConversation({ conversationId });
          setConfirm(null);
          router.replace(MESSAGES_BASE);
        }}
      />
      <ConfirmDialog
        open={confirm === 'block'}
        title={t('blockTitle', { name })}
        description={t('blockBody')}
        confirmLabel={t('block')}
        cancelLabel={t('cancel')}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await block({ userId: thread.otherUserId });
          setConfirm(null);
        }}
      />
      {reporting ? (
        <ReportDialog
          messageId={reporting}
          onClose={(sent) => {
            setReporting(null);
            if (sent) setNotice(t('reportSent'));
          }}
        />
      ) : null}
    </section>
  );
}

function Bubble({
  message: m,
  first,
  last,
  status,
  otherName,
  otherPhoto,
  time,
  fullTime,
  editable,
  canInteract,
  selected,
  onSelect,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onDelete,
  onReport,
  onJump,
}: {
  message: Message;
  first: boolean;
  last: boolean;
  status: 'seen' | 'sent' | null;
  otherName: string;
  otherPhoto: string | null;
  time: string;
  fullTime: string;
  editable: boolean;
  canInteract: boolean;
  selected: boolean;
  onSelect: () => void;
  onReact: (emoji: string | null) => void;
  onReply: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onReport: () => void;
  onJump: (id: Id<'directMessages'>) => void;
}) {
  const t = useTranslations('messages');
  const mine = m.reactions.find((r) => r.mine)?.emoji ?? null;
  const counts = new Map<string, { n: number; mine: boolean }>();
  for (const r of m.reactions) {
    const c = counts.get(r.emoji) ?? { n: 0, mine: false };
    counts.set(r.emoji, { n: c.n + 1, mine: c.mine || r.mine });
  }
  const me = m.fromMe;
  // Grouped bubbles: the corner on the sender's side tightens between them.
  const corners = me
    ? cn(!first && 'rounded-se-md', !last && 'rounded-ee-md')
    : cn(!first && 'rounded-ss-md', !last && 'rounded-es-md');

  const actions = (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5 self-center transition-opacity',
        'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        selected && 'opacity-100',
      )}
    >
      {canInteract && !m.removed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink"
              aria-label={t('react')}
            >
              <SmilePlus aria-hidden="true" className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align={me ? 'end' : 'start'}
            className="flex w-auto min-w-0 gap-0.5 rounded-pill p-1"
          >
            {MESSAGE_REACTIONS.map((e) => (
              <DropdownMenuItem
                key={e}
                aria-label={
                  mine === e ? t('reactionRemove', { emoji: e }) : undefined
                }
                className={cn(
                  'flex size-10 items-center justify-center rounded-pill p-0 text-xl',
                  mine === e && 'bg-accent-tint',
                )}
                onSelect={() => onReact(mine === e ? null : e)}
              >
                {e}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canInteract && !m.removed ? (
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink"
          aria-label={t('reply')}
          onClick={onReply}
        >
          <Reply aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={t('messageMenu')}
          >
            <EllipsisVertical aria-hidden="true" className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={me ? 'end' : 'start'} className="min-w-48">
          {!m.removed ? (
            <DropdownMenuItem onSelect={onCopy}>
              <Copy aria-hidden="true" className="size-4" />
              {t('copy')}
            </DropdownMenuItem>
          ) : null}
          {editable ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden="true" className="size-4" />
              {t('edit')}
            </DropdownMenuItem>
          ) : null}
          {!me && !m.removed ? (
            <DropdownMenuItem onSelect={onReport}>
              <Flag aria-hidden="true" className="size-4" />
              {t('report')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="text-bar-5" onSelect={onDelete}>
            <Trash2 aria-hidden="true" className="size-4" />
            {t('deleteMessage')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <li
      id={`msg-${m._id}`}
      className={cn(
        'group flex flex-col rounded-md transition-colors data-[flash=true]:bg-accent-tint',
        first ? 'mt-2' : 'mt-0.5',
        me ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'flex max-w-full items-end gap-2',
          me ? 'flex-row-reverse' : 'flex-row',
        )}
      >
        {!me ? (
          <span className="w-7 shrink-0">
            {last ? (
              <PersonAvatar name={otherName} photoUrl={otherPhoto} size={28} />
            ) : null}
          </span>
        ) : null}
        <div
          className={cn(
            'flex min-w-0 max-w-[min(78%,34rem)] flex-col',
            me ? 'items-end' : 'items-start',
          )}
        >
          {m.replyTo ? (
            <button
              type="button"
              onClick={() => m.replyTo && onJump(m.replyTo._id)}
              className={cn(
                'mb-[-0.75rem] max-w-full rounded-[1rem] border-s-2 border-line-strong bg-surface-2/70 px-3 pb-4 pt-1.5 text-start text-xs text-ink-soft',
              )}
            >
              <span className="block font-semibold">
                {m.replyTo.fromMe
                  ? t('replyToYou')
                  : t('replyToName', { name: otherName })}
              </span>
              <span dir="auto" className="line-clamp-2 wrap-anywhere">
                {m.replyTo.removed ? t('removed') : m.replyTo.excerpt}
              </span>
            </button>
          ) : null}
          {/* The bubble itself: a tap shows the actions on touch screens. */}
          <div
            onClick={onSelect}
            title={fullTime}
            className={cn(
              'relative whitespace-pre-wrap rounded-[1.25rem] px-3.5 py-2 text-[15px] leading-snug wrap-anywhere',
              me ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink',
              corners,
              m.removed && 'bg-transparent italic text-muted ring-1 ring-line',
            )}
          >
            <span className="sr-only">
              {me ? t('youSaid') : t('theySaid', { name: otherName })}{' '}
            </span>
            <span dir={m.removed ? undefined : 'auto'}>
              {m.removed ? t('removed') : m.body}
            </span>
            {m.editedAt !== null ? (
              <span
                className={cn(
                  'ms-2 text-[11px]',
                  me ? 'text-accent-contrast/75' : 'text-muted',
                )}
              >
                {t('edited')}
              </span>
            ) : null}
          </div>
          {counts.size > 0 ? (
            <button
              type="button"
              disabled={!canInteract || !mine}
              onClick={() => onReact(null)}
              className={cn(
                'relative z-[1] -mt-1.5 inline-flex items-center gap-0.5 rounded-pill border border-line bg-paper px-1.5 py-0.5 text-sm shadow-sm',
                me ? 'me-2' : 'ms-2',
                mine && 'enabled:hover:bg-surface-2',
              )}
              aria-label={t('reactions', {
                list: [...counts.keys()].join(' '),
              })}
            >
              {[...counts.entries()].map(([emoji, c]) => (
                <span key={emoji} aria-hidden="true">
                  {emoji}
                  {c.n > 1 ? (
                    <span className="text-[11px] text-muted">{c.n}</span>
                  ) : null}
                </span>
              ))}
            </button>
          ) : null}
        </div>
        {actions}
      </div>
      {last ? (
        <p
          className={cn(
            'mt-1 flex gap-1.5 text-[11px] text-muted',
            me ? 'pe-1' : 'ps-10',
          )}
        >
          <time dateTime={new Date(m.createdAt).toISOString()} title={fullTime}>
            {time}
          </time>
          {status ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{status === 'seen' ? t('seen') : t('sent')}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

function ReportDialog({
  messageId,
  onClose,
}: {
  messageId: Id<'directMessages'>;
  onClose: (sent: boolean) => void;
}) {
  const t = useTranslations('messages');
  const report = useMutation(api.social.messages.reportMessage);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      title={t('reportTitle')}
      description={
        <span className="block space-y-3">
          <span className="block">{t('reportBody')}</span>
          <TextareaField
            label={t('reportReason')}
            value={reason}
            rows={3}
            maxLength={REPORT_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
          />
          {error ? <FormError>{error}</FormError> : null}
        </span>
      }
      confirmLabel={t('reportConfirm')}
      cancelLabel={t('cancel')}
      pending={pending}
      onCancel={() => onClose(false)}
      onConfirm={async () => {
        setPending(true);
        setError(null);
        try {
          await report({ messageId, reason: reason.trim() || undefined });
          onClose(true);
        } catch (err) {
          setError(
            vocabulary(t, 'errors.', errorCode(err), t('errors.generic')),
          );
        } finally {
          setPending(false);
        }
      }}
    />
  );
}
