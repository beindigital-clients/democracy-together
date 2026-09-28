'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEARCH_MIN_LENGTH } from '@convex/lib/search';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';

// SEARCH FIELD FOR BACK-OFFICE LISTS (issue #49).
//
// The search is SERVER-SIDE: this component filters nothing, it produces the
// term that the list passes as an argument to its paginated query. That is
// the issue's constraint, and it is not an implementation detail — filtering
// the displayed page would only search the 25 or 50 rows already loaded,
// whereas the screen exists precisely to find those that are not there.
//
// Two things, then, and only two:
//
//  1. FREQUENCY. One keystroke = one query argument = one Convex
//     subscription. Without debouncing, "diop" would open four, three of them
//     discarded immediately. The term is only passed up once typing settles.
//  2. THE FLOOR. Below the server minimum, the term is passed up EMPTY rather
//     than as is: the server would ignore it anyway (lib/search.ts), but
//     sending it would change the arguments — and so reopen a subscription —
//     for exactly the same result. The threshold is imported, not copied.
const DEBOUNCE_MS = 250;

// Term actually applicable to the list, derived from the raw input.
function applicable(draft: string): string {
  const trimmed = draft.trim();
  return trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : '';
}

export function AdminSearch({
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  label: string;
  placeholder?: string;
  // Term currently applied to the list (the one the query receives).
  value: string;
  onChange: (term: string) => void;
  className?: string;
}) {
  const t = useTranslations('admin');
  const [draft, setDraft] = useState(value);
  // Last term passed up. Serves two purposes: not re-emitting an identical
  // value (one `onChange` too many reopens the subscription), and telling
  // "the parent changed the term on its side" apart from "our own emission
  // coming back".
  const emitted = useRef(value);
  // `onChange` is often a closure recreated on every render. Keeping it out
  // of the debounce effect's dependencies prevents any parent render
  // — an incoming page of results, for example — from restarting the
  // delay, and thus postponing it indefinitely. The ref is updated
  // AFTER render: writing to it during render is forbidden (react-hooks/refs).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Reset coming from the parent (another filter, screen change): the
  // input follows. Our own emission, however, does not touch the field —
  // otherwise the raw text would be rewritten under the typist's fingers.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const next = applicable(draft);
    if (next === emitted.current) return;
    const timer = setTimeout(() => {
      emitted.current = next;
      onChangeRef.current(next);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <TextField
        // A real (hidden) `<label>` rather than an `aria-label` set alongside:
        // it is the repo's field system (#41) that carries the association.
        // `type="search"` gives the field its accessible `searchbox` role, hence
        // a name that does not rely on the `placeholder` alone.
        label={label}
        labelHidden
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        className="min-w-0 flex-1 sm:max-w-sm"
        controlClassName="py-1.5 text-sm"
      />
      {draft ? (
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => setDraft('')}
        >
          {t('searchClear')}
        </Button>
      ) : null}
    </div>
  );
}
