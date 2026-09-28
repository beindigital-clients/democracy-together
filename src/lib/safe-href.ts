// SCHEME filter on URLs this repo does not write (pentest M-9).
//
// Two sources feed `href`s coming from elsewhere: links in Sanity rich text
// (`link` annotation, entered in the CMS) and the website address of a
// directory entry, filled in at membership and then published. The pentest
// described the `javascript:` case; the replay shows it is the LEAST severe
// of the three, and that the safeguard we could have relied on only covers
// that one:
//
//   javascript:alert(1)       React 19 neutralizes it ITSELF — it rewrites
//                             the attribute to `javascript:throw new Error(…)` and
//                             logs a warning. Verified, in every letter case
//                             and with leading whitespace.
//   data:text/html;base64,…   goes through AS IS. A full HTML page, with an
//                             opaque origin, opened from a click on the site.
//   vbscript:msgbox(1)        goes through as is.
//
// Hence an allowlist rather than a denylist: whatever is not explicitly
// allowed is refused, including the scheme someone will invent after
// this review.
export const SCHEMAS_AUTORISES = ['http:', 'https:', 'mailto:'] as const;

// Dummy base used to RESOLVE relative URLs. `/fr/actualites`,
// `#section` or `?page=2` are legitimate links in rich text: without a
// base, `new URL` would reject them all.
const BASE_RELATIVE = 'https://relative.invalid';

/**
 * The URL if its scheme is allowed, `undefined` otherwise — instead of an
 * empty `href`, which would make a dead link instead of plain text.
 *
 * WHY `new URL` RATHER THAN A `startsWith`. The WHATWG standard URL parser —
 * the one behind `new URL`, and the one the browser applies to the `href`
 * attribute — strips tabs and line breaks, ignores leading control
 * characters, and lowercases the scheme. A hand-written prefix test would
 * let `JaVaScRiPt:`, `java\tscript:` and ` javascript:` through; here all
 * three arrive normalized at comparison time. The RENDERED string is the one
 * that was parsed, so the browser will read exactly what this function
 * validated.
 */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  if (!href) return undefined;

  let url: URL;
  try {
    url = new URL(href, BASE_RELATIVE);
  } catch {
    return undefined;
  }

  return (SCHEMAS_AUTORISES as readonly string[]).includes(url.protocol)
    ? href
    : undefined;
}
