// READING ARROWS — "forward" and "backward", not "right" and
// "left".
//
// The repository wrote these arrows out literally in the JSX: `{t('next')} →`,
// `← {t('back')}`. That is correct in four languages out of five and WRONG in the
// fifth, for a reason that is invisible when reading the code:
// Unicode's bidirectional algorithm MIRRORS certain characters according to the
// text direction — parentheses, brackets, angle brackets — but NOT
// arrows. U+2192 does not have the `Bidi_Mirrored` property. In an Arabic page,
// "اقرأ المزيد ←" would therefore keep an arrow pointing right, that is,
// toward the START of the line: the "next" link would point to the previous one.
//
// WHY CSS AND NOT A CHECK ON THE LOCALE. These arrows live in
// SERVER components (`getTranslations`) as well as CLIENT components
// (`useTranslations`). Reading the locale would require two implementations, or
// turning into client components pages that have no reason to be. The writing direction
// is already carried by `<html dir>`: a `[dir='rtl']` rule reads it without
// JavaScript, without a locale to pass, and without a boundary to cross.
//
// The glyph is SUBSTITUTED, not flipped by a transform: `scaleX(-1)`
// on an arrow gives a mirrored drawing with badly drawn ends, whereas
// "←" is a character in its own right, kerned with the surrounding text.
// Both rules are in `globals.css`.
//
// NON-directional arrows stay written as is: a download's "↓"
// points down in all five languages.

/** "Forward" arrow: right in Latin script, left in Arabic. */
export function ArrowForward() {
  return <span aria-hidden="true" className="dt-arrow-fwd" />;
}

/** "Back" arrow: left in Latin script, right in Arabic. */
export function ArrowBack() {
  return <span aria-hidden="true" className="dt-arrow-back" />;
}
