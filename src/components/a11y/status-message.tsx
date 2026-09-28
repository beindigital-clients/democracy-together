'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// CONFIRMATION MESSAGE THAT REPLACES A FORM (RGAA 7.5 and 12.8).
//
// Pattern measured in the 27/09 RGAA audit on ten forms (contact, membership,
// newsletter, event registration and reminder, youth hub, mentoring,
// call for projects, publication submission, password): on successful
// submission, the form is replaced by a `role="status"` created AT THE SAME
// TIME as its text. Two defects follow:
//
//  1. the submit button, which had focus, disappears from the DOM — focus
//     falls back to `<body>`, and the next tab press restarts from the top of
//     the page;
//  2. a live region inserted together with its content is not announced
//     reliably (NVDA and JAWS often announce it in Chrome, VoiceOver
//     rarely): the person does not know whether the submission succeeded.
//
// Moving FOCUS to the message fixes both at once: it is read because it is
// focused, whatever the screen reader, and navigation resumes where the form
// was. `tabIndex={-1}`: focusable by script, outside the tab sequence.
// `role="status"` is kept for assistive technologies that follow live
// regions without following focus.
//
// Mounted ONLY on success (the caller decides to render it): the effect
// only runs when it appears, never on page load.
export function StatusMessage({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: 'div' | 'p' | 'span';
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement & HTMLParagraphElement & HTMLSpanElement>(
    null,
  );
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Tag ref={ref} role="status" tabIndex={-1} className={className}>
      {children}
    </Tag>
  );
}
