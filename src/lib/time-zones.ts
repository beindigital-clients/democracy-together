// TIME ZONE CHOICES for the searchable lists (events, calls for projects).
//
// The server accepts any IANA time zone (`isValidTimeZone`); the forms used
// to offer a dozen, one of them as a free-text field with suggestions, where
// a typo was only caught on saving. The list is now every zone the browser
// knows — searchable, so "dakar" or "sao" finds its line — with the usual
// ones first, in the caller's order. `UTC` is added: V8 does not list it.
//
// The current value is kept even when the runtime does not know it, so a
// saved form never shows an empty field.
export function timeZoneChoices(
  preferred: readonly string[],
  current?: string,
): string[] {
  const all =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
  const zones = new Set([...preferred, ...all, 'UTC']);
  if (current) zones.add(current);
  return [...zones];
}
