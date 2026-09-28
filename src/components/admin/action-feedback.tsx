'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useServerErrorMessage } from '@/components/admin/server-error';

// VISIBLE FEEDBACK after a back-office action (issue #38).
//
// The moderation screens showed NOTHING after a decision: the handlers
// silently swallowed the server error ("insufficient role", "decision
// already made") and success could only be guessed from the row leaving the
// queue. The moderator was left unsure of what had just happened — and a
// silent refusal reads like an unregistered click, so it gets replayed.
//
// Two STATIC live regions, mounted once for the whole back office: a
// polite one (`role="status"`) for successes, an assertive one
// (`role="alert"`) for failures. They are always declared, empty or not: a
// live region added to the DOM together with its text is not announced
// reliably by screen readers.
//
// SEVERAL MESSAGES AT ONCE (27/09 campaign, C-5). Only one message was
// kept: a quick action after another REPLACED the previous one, and when
// the second produced none ("Rouvrir", m-5), the old one — "rejected" —
// stayed displayed during the reopening, to be read backwards. Messages
// now stack in their region, each with its own timeout. A single
// eviction: a FAILURE clears the successes still displayed. The alert
// interrupts reading anyway, and leaving "… approved." next to
// "Action non effectuée" would cast doubt on which of the two refers to the
// action just performed.
type Tone = 'success' | 'error';
type Notify = (message: string, tone?: Tone) => void;

const ActionFeedbackContext = createContext<Notify>(() => {});

export function useActionFeedback(): Notify {
  return useContext(ActionFeedbackContext);
}

// Feedback for a server REFUSAL, translated by its code (R-08): to be called
// in a mutation's `catch`, instead of a `notify(t('feedbackError'))` that
// blamed permissions whatever the reason.
export function useFailureFeedback(): (err: unknown) => void {
  const notify = useActionFeedback();
  const message = useServerErrorMessage();
  return useCallback(
    (err: unknown) => notify(message(err), 'error'),
    [notify, message],
  );
}

const DISMISS_MS = 6000;
// Beyond that, the oldest give way: a stack that covers the screen
// no longer informs.
const MAX_VISIBLE = 4;

type Item = { id: number; tone: Tone; message: string };

function Toast({
  tone,
  message,
  dismissLabel,
  onDismiss,
}: {
  tone: Tone;
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto flex max-w-[min(34rem,calc(100vw-2rem))] items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-pop ${
        tone === 'error'
          ? 'border-bar-5 text-bar-5'
          : 'border-line-strong text-ink'
      }`}
    >
      <span className="wrap-anywhere leading-relaxed">{message}</span>
      {/* `p-1.5` around a 16 px icon: a 28 px target, where 20 px
          escaped the finger and got clipped at the right edge (27/09, C-3). */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-me-2 -mt-1 ms-auto shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, tone = 'success') => {
      // Incrementing id, not the text: two successive rejections
      // carry the same message, and without a node change the live region
      // would only announce the first.
      seq.current += 1;
      const id = seq.current;
      setItems((list) => {
        const kept =
          tone === 'error' ? list.filter((i) => i.tone === 'error') : list;
        const next = [...kept, { id, tone, message }];
        const evicted = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
        for (const e of evicted) {
          const timer = timers.current.get(e.id);
          if (timer) clearTimeout(timer);
          timers.current.delete(e.id);
        }
        return next.slice(-MAX_VISIBLE);
      });
      timers.current.set(
        id,
        setTimeout(() => remove(id), DISMISS_MS),
      );
    },
    [remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const render = (tone: Tone) =>
    items
      .filter((i) => i.tone === tone)
      .map((i) => (
        <Toast
          key={i.id}
          tone={i.tone}
          message={i.message}
          dismissLabel={t('feedbackDismiss')}
          onDismiss={() => remove(i.id)}
        />
      ));

  return (
    <ActionFeedbackContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-6">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-col items-center gap-2"
        >
          {render('success')}
        </div>
        <div
          role="alert"
          aria-atomic="true"
          className="flex flex-col items-center gap-2"
        >
          {render('error')}
        </div>
      </div>
    </ActionFeedbackContext.Provider>
  );
}
