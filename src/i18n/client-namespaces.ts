import type { AbstractIntlMessages } from 'next-intl';

// What the message catalogue sends to the BROWSER (audit F-05).
//
// Before: the layout passed the ENTIRE `getMessages()` to the client provider, i.e.
// the catalogue's 32 namespaces serialized into the HTML of EVERY page.
// Measured on `/fr/a-propos`: 39 long values out of 39 belonging to
// screens the page does not render — event reminders, back-office, membership
// funnel — present in the served document. Out of 142 KB of HTML, the
// catalogue weighed 44.
//
// A SERVER component reads its messages via `getTranslations`, which sends
// nothing to the browser. Only components marked `'use client'` need
// a catalogue on that side. The two lists below are therefore
// exactly the set of namespaces they request — no more, no less — and
// `tests/unit/i18n-client-namespaces.test.ts` RECOMPUTES them from the
// sources on each run, so that they cannot drift
// silently.
//
// Why a list and not page-by-page filtering: a client component
// may only be mounted on interaction (search palette, cookie
// banner, dialogs). A filter computed at page load would miss them,
// and a missing key breaks nothing on screen — it renders the
// last segment. The defect would therefore be invisible. The list, however, is derived
// statically from ALL client components, whenever they
// arrive.

/**
 * Namespaces requested by client components rendered outside the back-office.
 *
 * This is what the HTML of every public page carries.
 */
export const BASE_CLIENT_NAMESPACES = [
  // Accounts workstream: member-area screens (data, security,
  // organization), second-factor entry after sign-in, suspended-account
  // message on the sign-in page. The back-office uses them too
  // (account lifecycle, 2FA setting, organization records), but they
  // cannot be reserved for `admin/layout.tsx`: public pages
  // request them.
  'accounts',
  'accessibility',
  'auth',
  'contact',
  'cookies',
  'errors',
  'eventRegister',
  // `footer` IS NOT IN IT, and it was the test that said so: `site-footer.tsx`
  // does call `useTranslations('footer')`, but without a `'use
  // client'` directive and without being imported from a client boundary. It is therefore a
  // server component, which reads its messages without sending anything to the browser.
  // My hand-written list had included it.
  'library',
  'membership',
  'mentorship',
  // `messages`: the messaging badge is in the header of EVERY
  // page ("social" workstream).
  'messages',
  'nav',
  'newsletter',
  'notifications',
  // `people` and `profile`: social network screens (people directory,
  // buttons on a public profile page, member area).
  'people',
  'profile',
  // `payments`: donation form, payment return, member area
  // (membership fees, receipts) — and the Finances screen, which shares it.
  'payments',
  // `privacy`: the audience-measurement opt-out control, placed in the
  // privacy policy (F-66, diffusion workstream).
  'privacy',
  'orgAdmin',
  // `peerReview`: the author's follow-up (member area, F-43) is a
  // client component; the back-office reuses the same namespace.
  'peerReview',
  'projects',
  'reminder',
  'search',
  // "Programmes" workstream (F-56 to F-60): toolbox and learning paths, Youth
  // profile — client islands on public pages and in the member area.
  'toolbox',
  // `translation`: the translation banner is a SERVER component, but it
  // mounts `TranslateButton` — a button that calls a Convex action, hence
  // necessarily client-side. It is the only piece of this mechanism that crosses
  // the RSC boundary.
  'translation',
  'tribune',
  'twoFactor',
  'workspaces',
  'youth',
  'youthApply',
] as const;

/**
 * Namespaces that ONLY the back-office requests.
 *
 * `admin` weighs 10 KB on its own — 22% of the catalogue — for screens
 * behind authentication, disallowed for crawling, and that no public visitor
 * reaches. It is therefore set by `admin/layout.tsx` and not by the root
 * layout. Verified: all client components that request it live under
 * `app/[locale]/admin/` or `components/admin/`.
 */
// Back-office namespaces: each workstream adds its own here.
export const ADMIN_NAMESPACES = [
  'admin',
  'analytics',
  'moderationQueue',
  'contentAdmin',
  'reports',
] as const;

/** All namespaces requested by a client component, wherever it is. */
export const CLIENT_NAMESPACES = [
  ...BASE_CLIENT_NAMESPACES,
  ...ADMIN_NAMESPACES,
] as const;

/**
 * Restricts a catalogue to the named namespaces.
 *
 * A namespace missing from the catalogue is skipped rather than set to `undefined`:
 * `next-intl` would treat the null value as an empty namespace and hide
 * the error. Its absence, on the other hand, triggers `getMessageFallback`.
 */
export function pickNamespaces(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const out: Record<string, unknown> = {};
  for (const ns of namespaces) {
    if (ns in messages) out[ns] = messages[ns];
  }
  return out as AbstractIntlMessages;
}
