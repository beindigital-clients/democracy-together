import { Fragment } from 'react';
import { formatAuthorParts } from '@/lib/publications';

// Author list for the publication page: "A, B et C" / "A, B, and C".
//
// NAMES are bold, separators in regular text — and those separators
// are a LANGUAGE rule, not a rule to write here. The page used to assemble them
// by hand, picking the conjunction with a ternary on the locale
// (issue #34): the "Par"/"By" label was then in no message
// file, and the invented rule forgot the English comma before "and".
//
// `formatAuthorParts` (Intl.ListFormat) returns the list SPLIT: `element`
// segments are the names, `literal` segments the separators. That
// split is what lets the names be bolded without touching punctuation
// — and with nothing to rewrite the day a third language arrives.
export function AuthorList({
  names,
  locale,
}: {
  names: string[];
  locale: string;
}) {
  return (
    <>
      {formatAuthorParts(names, locale).map((part, i) =>
        part.type === 'element' ? (
          <b key={`${part.type}-${i}`} className="font-semibold text-ink">
            {part.value}
          </b>
        ) : (
          <Fragment key={`${part.type}-${i}`}>{part.value}</Fragment>
        ),
      )}
    </>
  );
}
