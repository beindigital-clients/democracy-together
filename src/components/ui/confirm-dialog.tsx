'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

// SAFEGUARD for irreversible back-office actions (issue #38): rejecting an
// application, rejecting a publication, removing content from the tribune,
// changing a role. All of them ran on the first click; since the state
// machine (#9), an application decision cannot even be replayed.
//
// ACCESSIBILITY IS NOT REINVENTED: it is the pattern already used by
// `search-dialog` and `mobile-nav` — `role="dialog"` + `aria-modal`, closing on
// Escape and on outside click, focus trap, body scroll lock, focus
// returned to the trigger on close. Only the content changes.
//
// The title is supplied by the caller and NAMES the target ("Rejeter la
// candidature de Institut Démo Sahel ?"): a generic "Confirmer ?" would only
// ask for a second click, without saying which of the fifteen items in the
// queue is targeted — which is precisely the mistake we're trying to catch.
//
// Focus goes to the CANCEL button: on a dialog that guards against an
// accidental gesture, confirming with the Enter key would be that gesture.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  // Action in progress: both outcomes are disabled, Escape and outside
  // click too — closing during the call would leave the screen silent about its outcome.
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // `createPortal` needs `document`: it does not exist during server render.
  // This component already renders `null` while closed, but we don't rely
  // on that — a caller may mount it open.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  const titleId = useId();
  const descId = useId();

  // Open / close: scroll lock, focus sent into the panel,
  // then returned to the element that opened the dialog (the row's button).
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector('button')?.focus();
    return () => {
      document.body.style.overflow = '';
      trigger?.focus?.();
    };
    // `monte` IS PART OF THE DEPENDENCIES, and it is not decorative: with the
    // portal, the first render produces nothing (`document` does not exist yet
    // on the server, so we wait for mount). `panelRef.current` is then
    // `null` and this focus finds nobody. Without this dependency, the effect never
    // re-runs: focus no longer lands on "Annuler", and an
    // Enter key press falls on the destructive action — exactly what this
    // component exists to prevent. Caught by the existing unit tests,
    // not by review.
  }, [open, monte]);

  // Escape + focus trap. A separate effect: it depends on `onCancel`, whose
  // identity changes on every parent render — merging it with the previous one
  // would send focus back to the trigger on every render.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!pending) onCancel();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]), button:not([disabled]), input, select, textarea',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending, onCancel]);

  if (!open || !monte) return null;

  // PORTAL to `document.body` (audit F-13, option 2 of the report).
  //
  // This container is `fixed`, so positioned relative to the viewport — but
  // only as long as NO ancestor has `transform`, `filter` or
  // `perspective`: any of those three creates a containing block, and the `fixed` element
  // anchors to it instead. The back-office has none of them today (verified),
  // but it is a property that a future component can introduce from afar,
  // with no visible connection to this dialog. The day that happens,
  // the dialog is misplaced FOR USERS, not just for a test.
  //
  // Rendering it from `body` removes this dependency on the calling tree. It is
  // also what makes its stacking (`z-[60]`) reliable, for the same reason:
  // a stacking context created by an ancestor would cap it.
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          if (!pending) onCancel();
        }}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/30 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="absolute inset-x-4 top-[18vh] z-10 mx-auto max-w-md rounded-lg border border-line bg-paper p-5 shadow-pop sm:inset-x-0"
      >
        {/* `text-balance`: the title carries the target's name, so its length
            is not under control — without balancing, a slightly long name leaves the
            "?" alone on the last line. */}
        {/* `wrap-anywhere`: the target's name may be an email address
            without spaces — measured on 27/09 on mobile, it overflowed the panel. */}
        <h2
          id={titleId}
          className="wrap-anywhere text-balance font-display text-lg text-ink"
        >
          {title}
        </h2>
        {description ? (
          <div
            id={descId}
            className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft"
          >
            {description}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
