'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';

// Building blocks shared by the six content screens: the edit form's
// frame, and running an action with visible feedback (success announced
// by the back-office live region, refusal translated by its server code).

/** Runs a mutation, announces success, translates the refusal. */
export function useRunAction() {
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [pending, setPending] = useState(false);
  async function run<T>(fn: () => Promise<T>, success?: string) {
    setPending(true);
    try {
      const result = await fn();
      if (success) notify(success);
      return result;
    } catch (err) {
      fail(err);
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { run, pending };
}

export function EditorShell({
  title,
  onSubmit,
  onClose,
  pending,
  children,
  aside,
}: {
  title: string;
  onSubmit: () => void;
  onClose: () => void;
  pending: boolean;
  children: ReactNode;
  // Public preview, on the right on large screens.
  aside?: ReactNode;
}) {
  const t = useTranslations('contentAdmin');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <section
      aria-labelledby="content-editor-title"
      className="mt-6 rounded-md border border-line-strong bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="content-editor-title"
          className="font-display text-xl wrap-anywhere"
        >
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={onClose}
        >
          {t('close')}
        </Button>
      </div>
      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <form onSubmit={submit} className="grid gap-4">
          {children}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending ? t('saving') : t('save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
        {aside ? <div>{aside}</div> : null}
      </div>
    </section>
  );
}

/** Destructive action button, protected by a named confirmation. */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
}: {
  label: string;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  destructive?: boolean;
}) {
  const t = useTranslations('contentAdmin');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={t('keep')}
        destructive={destructive}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            await onConfirm();
          } finally {
            setPending(false);
            setOpen(false);
          }
        }}
      />
    </>
  );
}

/** Public preview of a card, in the editing language. */
export function PreviewCard({
  heading,
  fallback,
  children,
}: {
  heading: string;
  fallback: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('contentAdmin');
  return (
    <aside
      aria-label={heading}
      className="rounded-sm border border-dashed border-line-strong bg-paper p-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {heading}
      </p>
      <div className="mt-3">{children}</div>
      {fallback ? (
        <p className="mt-3 text-[12px] text-ink-soft">{t('previewFallback')}</p>
      ) : null}
    </aside>
  );
}
