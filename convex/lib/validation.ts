// Shared validation — Convex (server) side. The client equivalent lives in
// src/lib/validation.ts (the Convex/Next boundary rules out a single module:
// keep the two in sync).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Maximum length of an address, RFC 5321 § 4.5.3.1.3 (reverse path: 256
// bytes, brackets included — i.e. 254 address characters).
//
// WHY HERE, and not in each form. The expression above accepts
// "a...a@b...b.c" of any length: the 18/09 pentest (M-2, "flooding" item)
// found submissions of up to ~1 MB on the public forms. Bounding it here
// covers at once the seven that go through `isEmail` — contact, newsletter,
// membership, events, reminders, youth, mentoring — instead of seven fixes to
// keep in sync.
export const EMAIL_MAX_LENGTH = 254;

export function isEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(v);
}

// Domains reserved by RFC 2606 and RFC 6761: no mailbox behind them. The E2E
// and the production smoke tests use them; an e-mail there would only bounce
// and hurt the sender's reputation. Every e-mail the platform sends on its
// own initiative to an address typed into a public form checks this first.
export function isReservedEmail(email: string): boolean {
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf('@') + 1);
  return (
    /(^|\.)(test|example|invalid|localhost)$/.test(domain) ||
    /(^|\.)example\.(com|net|org)$/.test(domain)
  );
}

// Bounds for FREE-TEXT fields of public forms (pentest M-2, "flooding" item:
// "no max length on contact, storeApplication […] up to ~1 MB per
// submission"). The values are the ones the pentest itself proposed —
// 120 / 200 / 4000.
//
// `youth`, `mentorship` and `events` already bounded their fields with the
// same numbers, written inline; `contact`, `organizations` and the e-mail
// address bounded nothing. The constants are here so that the next addition
// does not have to guess them again.
export const FIELD_MAX = {
  name: 120,
  subject: 200,
  body: 4000,
  country: 120,
} as const;

// Schemes accepted for a WEBSITE ADDRESS (pentest M-9, write side).
//
// A directory profile's `websiteUrl` was only constrained by `v.string()`:
// any string went into the database, and the public profile put it as is in
// an `href`. The render filter (src/lib/safe-href.ts) remains necessary — it
// covers profiles saved before this validation — but letting
// `data:text/html;…` in only to stop it at display time would amount to
// storing a payload while waiting for the next screen that forgets to filter
// it.
//
// Stricter than the render list, deliberately: `mailto:` is allowed there
// for a rich-text link, but an organisation's field named "website" is not.
const SCHEMAS_SITE = ['http:', 'https:'];

export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    // No base: a website address is ABSOLUTE. `institut-x.org` without a scheme
    // is refused — it is incomplete input, not a link.
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return SCHEMAS_SITE.includes(url.protocol);
}

// Bounds for the BODY of a Tribune post, PER FORMAT (F-46, 27/09 campaign,
// anomaly A-05). The specification talks about a contribution "calibrated at
// ~10,000 characters"; the server accepted 20,000 whatever the format, and
// the composer showed neither a counter nor a limit: 12,000 characters went
// through as a "Brève" without a word, 21,000 failed with a generic message.
// A "Brève" is capped at 10,000, an "Analyse" at 20,000 — the composer
// (src/components/tribune/tribune-composer.tsx) reads the SAME numbers
// through the `@convex/lib/validation` alias, so that the counter, the
// `maxLength` and the server rejection cannot diverge.
export const TRIBUNE_BODY = {
  court: { min: 10, max: 10000 },
  fond: { min: 200, max: 20000 },
} as const;

export type TribuneFormat = keyof typeof TRIBUNE_BODY;

// Tribune comment: same number as `FIELD_MAX.body`, but named for what it
// bounds — the comment form displays it on screen (A-06).
export const TRIBUNE_COMMENT = { min: 2, max: FIELD_MAX.body } as const;
