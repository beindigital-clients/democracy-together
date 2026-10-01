'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Reply, SendHorizontal, Smile, X } from 'lucide-react';
import { MESSAGE_BOUNDS, TYPING_RENEW_MS } from '@convex/lib/social';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FormError } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

// Message composer: grows with its text (up to a few lines, then scrolls),
// Enter sends, Shift+Enter breaks the line, Escape drops the reply or the
// correction in progress. The text is cleared AS SOON AS it is sent and put
// back if sending fails, so the conversation never waits on the network.

// Common emoji inserted at the cursor: a light picker, not a catalogue.
const EMOJI = [
  '😀',
  '😂',
  '😊',
  '😍',
  '🙂',
  '😉',
  '🤔',
  '😮',
  '😢',
  '🙏',
  '👍',
  '👏',
  '🙌',
  '💪',
  '🎉',
  '❤️',
  '🔥',
  '✅',
  '👀',
  '📌',
  '📅',
  '🌍',
  '🗳️',
  '✊',
] as const;

// Characters left before the counter shows up.
const COUNTER_FROM = MESSAGE_BOUNDS.max - 200;

export type ComposerContext =
  | { kind: 'reply'; excerpt: string; label: string }
  | { kind: 'edit'; body: string };

export function MessageComposer({
  label,
  onSend,
  onTyping,
  context,
  onCancelContext,
  autoFocus,
}: {
  label: string;
  onSend: (body: string) => Promise<void>;
  // Called at most every TYPING_RENEW_MS while typing, and with `false` once
  // the field is emptied.
  onTyping?: (typing: boolean) => void;
  context?: ComposerContext | null;
  onCancelContext?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations('messages');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  // Starting a correction loads the message; starting a reply focuses.
  const editBody = context?.kind === 'edit' ? context.body : null;
  useEffect(() => {
    if (editBody !== null) setBody(editBody);
  }, [editBody]);
  useEffect(() => {
    if (context) field.current?.focus();
  }, [context]);

  // Auto-grow: height follows the content up to the CSS max-height.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  function signalTyping(next: string) {
    if (!onTyping) return;
    if (next.trim() === '') {
      if (lastTyping.current !== 0) onTyping(false);
      lastTyping.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTyping.current >= TYPING_RENEW_MS) {
      lastTyping.current = now;
      onTyping(true);
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    setBody('');
    lastTyping.current = 0;
    setPending(true);
    try {
      await onSend(text);
    } catch (err) {
      setBody(text);
      setError(
        err instanceof Error && err.message ? err.message : t('errors.generic'),
      );
    } finally {
      setPending(false);
      field.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape' && context) {
      e.preventDefault();
      if (context.kind === 'edit') setBody('');
      onCancelContext?.();
      return;
    }
    // `isComposing`: an input method (Japanese, Chinese…) uses Enter to
    // validate a word, not to send.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  function insertEmoji(emoji: string) {
    const el = field.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = (body.slice(0, start) + emoji + body.slice(end)).slice(
      0,
      MESSAGE_BOUNDS.max,
    );
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  const empty = body.trim() === '';
  const hintId = `${useId()}-hint`;
  return (
    <form
      onSubmit={submit}
      className="border-t border-line bg-surface p-2 sm:p-3"
    >
      {context ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border-s-4 border-accent bg-surface-2 px-3 py-2 text-sm">
          {context.kind === 'reply' ? (
            <Reply
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted"
            />
          ) : (
            <Pencil
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-accent-text">
              {context.kind === 'reply' ? context.label : t('editing')}
            </p>
            {context.kind === 'reply' ? (
              <p dir="auto" className="truncate text-ink-soft">
                {context.excerpt}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="subtle"
            size="icon-md"
            // On the grey reply box, the hover needs the darker grey.
            className="-m-1 rounded-full hover:bg-line"
            aria-label={
              context.kind === 'reply' ? t('cancelReply') : t('cancelEdit')
            }
            onClick={() => {
              if (context.kind === 'edit') setBody('');
              onCancelContext?.();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="subtle"
              size="icon-lg"
              className="rounded-full"
              aria-label={t('emoji')}
            >
              <Smile aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="grid w-auto grid-cols-8 gap-0.5 p-1.5"
          >
            {EMOJI.map((e) => (
              <DropdownMenuItem
                key={e}
                className="flex size-9 items-center justify-center p-0 text-xl"
                onSelect={() => insertEmoji(e)}
              >
                {e}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Field label={label} labelHidden className="min-w-0 flex-1">
          {(control) => (
            <textarea
              {...control}
              ref={field}
              rows={1}
              dir="auto"
              value={body}
              autoFocus={autoFocus}
              maxLength={MESSAGE_BOUNDS.max}
              placeholder={t('composerPlaceholder')}
              aria-describedby={hintId}
              aria-invalid={error ? true : undefined}
              className="block max-h-40 min-h-11 w-full resize-none rounded-[1.375rem] border border-line-strong bg-paper px-4 py-2.5 text-[15px] leading-snug text-ink wrap-anywhere placeholder:text-muted"
              onChange={(e) => {
                setBody(e.target.value);
                signalTyping(e.target.value);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                if (lastTyping.current !== 0) onTyping?.(false);
                lastTyping.current = 0;
              }}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="icon-lg"
          disabled={empty}
          className="rounded-full"
          aria-label={context?.kind === 'edit' ? t('saveEdit') : t('send')}
        >
          <SendHorizontal
            aria-hidden="true"
            className="size-5 rtl:-scale-x-100"
          />
        </Button>
      </div>
      <p
        id={hintId}
        className="mt-1 flex justify-between gap-3 px-2 text-[11px] text-muted"
      >
        <span className="hidden sm:inline">{t('enterHint')}</span>
        {body.length >= COUNTER_FROM ? (
          <span className="ms-auto tabular-nums">
            {t('count', { count: body.length, max: MESSAGE_BOUNDS.max })}
          </span>
        ) : null}
      </p>
      <FormError className="mt-1 px-2">{error}</FormError>
    </form>
  );
}
