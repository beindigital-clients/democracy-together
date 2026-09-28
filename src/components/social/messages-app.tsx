'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { MESSAGE_BOUNDS, REPORT_REASON_MAX } from '@convex/lib/social';
import { Link, useRouter } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextareaField } from '@/components/ui/field';
import { ArrowBack } from '@/components/ui/arrow';
import { PersonAvatar } from './person-avatar';

// MESSAGERIE PRIVÉE — liste des conversations + fil + rédaction.
//
// Temps réel par construction : chaque morceau est une query Convex, donc un
// message reçu apparaît dans le fil, la liste et la pastille d'en-tête sans
// rechargement. Le fil ouvert est marqué lu à chaque nouveau message reçu.
//
// L'adresse porte l'état (`?c=<conversation>` ou `?to=<handle>`) : un lien de
// notification ouvre directement la bonne conversation, et le bouton
// « retour » du navigateur ramène à la liste sur mobile.

const BASE = '/espace-membre/messages';

function errorCode(err: unknown): string {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : 'generic';
}

export function MessagesApp() {
  const t = useTranslations('messages');
  const params = useSearchParams();
  const me = useQuery(api.users.current);
  const mine = useQuery(api.social.profiles.getMine);
  const conversationId = params.get('c') as Id<'conversations'> | null;
  const to = params.get('to');

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

  const selected = conversationId !== null || to !== null;
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(15rem,20rem)_1fr]">
      <div className={selected ? 'hidden md:block' : undefined}>
        <ConversationList selectedId={conversationId} />
      </div>
      <div className={selected ? undefined : 'hidden md:block'}>
        {conversationId ? (
          <Thread key={conversationId} conversationId={conversationId} />
        ) : to ? (
          <NewConversation
            key={to}
            handle={to}
            hasProfile={mine?.exists ?? false}
          />
        ) : (
          <p className="rounded-md border border-dashed border-line-strong bg-surface p-8 text-center text-ink-soft">
            {t('select')}
          </p>
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
  const items = useQuery(api.social.messages.listConversations);
  return (
    <section aria-labelledby="messages-liste">
      <h2 id="messages-liste" className="font-display text-xl">
        {t('conversations')}
      </h2>
      {items === undefined ? (
        <p role="status" className="mt-3 text-ink-soft">
          {t('loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {items.map((c) => {
            const name = c.other.displayName || t('unknownMember');
            const active = c.conversationId === selectedId;
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
                  href={`${BASE}?c=${c.conversationId}`}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 px-3 py-3 transition-colors ${
                    active ? 'bg-accent-tint' : 'hover:bg-surface-2'
                  }`}
                >
                  <PersonAvatar
                    name={name}
                    photoUrl={c.other.photoUrl}
                    size={40}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        c.unreadCount > 0
                          ? 'font-semibold text-ink'
                          : 'text-ink'
                      }`}
                    >
                      {name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {preview}
                    </span>
                  </span>
                  {c.unreadCount > 0 ? (
                    <span className="shrink-0 rounded-pill bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-contrast">
                      <span aria-hidden="true">{c.unreadCount}</span>
                      <span className="sr-only">
                        {t('unread', { count: c.unreadCount })}
                      </span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        {t('privacyNote')}
      </p>
    </section>
  );
}

function Thread({ conversationId }: { conversationId: Id<'conversations'> }) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
  const thread = useQuery(api.social.messages.getConversation, {
    conversationId,
  });
  const markRead = useMutation(api.social.messages.markRead);
  const send = useMutation(api.social.messages.sendMessage);
  const deleteMessage = useMutation(api.social.messages.deleteMessage);
  const deleteConversation = useMutation(
    api.social.messages.deleteConversation,
  );
  const block = useMutation(api.social.messages.block);
  const unblock = useMutation(api.social.messages.unblock);
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);
  const [reporting, setReporting] = useState<Id<'directMessages'> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);

  const unread = thread?.unreadCount ?? 0;
  // Ouvrir le fil vaut lecture — et chaque message reçu fil ouvert aussi.
  useEffect(() => {
    if (unread > 0) void markRead({ conversationId }).catch(() => undefined);
  }, [unread, conversationId, markRead]);

  const count = thread?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  if (thread === undefined) {
    return (
      <p role="status" className="text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (thread === null) {
    return <p className="text-ink-soft">{t('errors.NOT_FOUND')}</p>;
  }

  const name = thread.other.displayName || t('unknownMember');
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);

  return (
    <section aria-labelledby="messages-fil" className="flex flex-col">
      <Link
        href={BASE}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink md:hidden"
      >
        <ArrowBack /> {t('back')}
      </Link>
      <header className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <PersonAvatar name={name} photoUrl={thread.other.photoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <h2 id="messages-fil" className="wrap-anywhere font-display text-xl">
            {t('with', { name })}
          </h2>
          {thread.other.handle ? (
            <Link
              href={`/membres/${thread.other.handle}`}
              className="text-xs text-accent-text hover:underline"
            >
              {t('viewProfile')}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {thread.blockedByMe ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => unblock({ userId: thread.otherUserId })}
            >
              {t('unblock')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setConfirm('block')}
            >
              {t('block')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setConfirm('delete')}
          >
            {t('deleteConversation')}
          </Button>
        </div>
      </header>

      {thread.truncated ? (
        <p className="mt-3 text-xs text-muted">{t('truncated')}</p>
      ) : null}

      <ol
        className="mt-4 flex max-h-[60vh] min-h-[12rem] flex-col gap-3 overflow-y-auto pe-1"
        aria-live="polite"
        aria-relevant="additions"
      >
        {thread.messages.map((m) => (
          <li
            key={m._id}
            className={`flex max-w-[85%] flex-col ${m.fromMe ? 'ms-auto items-end' : 'me-auto items-start'}`}
          >
            <div
              className={`wrap-anywhere whitespace-pre-wrap rounded-md border px-3.5 py-2.5 text-[15px] leading-relaxed ${
                m.fromMe
                  ? 'border-accent-edge bg-accent-tint text-ink'
                  : 'border-line bg-surface text-ink'
              }`}
            >
              {m.removed ? (
                <em className="text-muted">{t('removed')}</em>
              ) : (
                m.body
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <time dateTime={new Date(m.createdAt).toISOString()}>
                {fmt(m.createdAt)}
              </time>
              {!m.fromMe && !m.removed ? (
                <button
                  type="button"
                  className="min-h-11 px-1 underline-offset-2 hover:text-ink hover:underline"
                  onClick={() => setReporting(m._id)}
                >
                  {t('report')}
                </button>
              ) : null}
              <button
                type="button"
                className="min-h-11 px-1 underline-offset-2 hover:text-ink hover:underline"
                onClick={() => deleteMessage({ messageId: m._id })}
              >
                {t('deleteMessage')}
              </button>
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>

      <p role="status" className="mt-2 text-sm text-bar-1">
        {notice}
      </p>

      {thread.refusal ? (
        <p className="mt-4 rounded-md border border-line bg-surface-2 p-4 text-sm text-ink-soft">
          {vocabulary(t, 'refusal.', thread.refusal)}
        </p>
      ) : (
        <Composer
          label={t('composerLabel')}
          onSend={async (body) => {
            await send({ conversationId, body });
          }}
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
          router.replace(BASE);
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

function Composer({
  label,
  onSend,
}: {
  label: string;
  onSend: (body: string) => Promise<void>;
}) {
  const t = useTranslations('messages');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSend(text);
      setBody('');
    } catch (err) {
      setError(vocabulary(t, 'errors.', errorCode(err), t('errors.generic')));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <TextareaField
        label={label}
        labelHidden
        placeholder={t('composerPlaceholder')}
        value={body}
        rows={3}
        maxLength={MESSAGE_BOUNDS.max}
        hint={t('count', { count: body.length, max: MESSAGE_BOUNDS.max })}
        error={error ?? undefined}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Entrée envoie ; Entrée seule garde le retour à la ligne
          // (un message privé se rédige parfois en paragraphes).
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
        }}
        controlClassName="wrap-anywhere"
      />
      <Button
        type="submit"
        className="min-h-11"
        disabled={pending || body.trim() === ''}
      >
        {pending ? t('sending') : t('send')}
      </Button>
    </form>
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

  // Une conversation existe déjà avec cette personne : on l'ouvre.
  const existing = rel?.conversationId ?? null;
  useEffect(() => {
    if (existing) router.replace(`${BASE}?c=${existing}`);
  }, [existing, router]);

  if (profile === undefined || rel === undefined) {
    return (
      <p role="status" className="text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (!profile || !rel || rel.isSelf) {
    return <p className="text-ink-soft">{t('errors.NOT_FOUND')}</p>;
  }
  if (!hasProfile) {
    return (
      <div className="rounded-md border border-accent-edge bg-accent-tint p-5">
        <p className="text-sm text-ink-soft">{t('profileRequired')}</p>
        <Button asChild className="mt-3 min-h-11">
          <Link href="/espace-membre/profil">{t('profileCta')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <section aria-labelledby="messages-nouveau">
      <Link
        href={BASE}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink md:hidden"
      >
        <ArrowBack /> {t('back')}
      </Link>
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <PersonAvatar
          name={profile.displayName}
          photoUrl={profile.photoUrl}
          size={44}
        />
        <h2
          id="messages-nouveau"
          className="wrap-anywhere font-display text-xl"
        >
          {t('newTo', { name: profile.displayName })}
        </h2>
      </div>
      <Composer
        label={t('composerLabel')}
        onSend={async (body) => {
          const id = await start({ userId: rel.userId, body });
          router.replace(`${BASE}?c=${id}`);
        }}
      />
    </section>
  );
}
