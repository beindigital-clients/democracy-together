import { routing } from '@/i18n/routing';

// Server-side gating of private areas (audit § 5.1).
//
// The finding: /admin/*, /espace-membre, /espaces and /notifications returned
// a 200 HTML page with "Chargement…", then redirected in JavaScript after
// 1.2 seconds. The DATA stayed protected — Convex's server-side RBAC holds —
// but at the HTTP level there was neither a 401 nor a 403, a blank page
// without JavaScript, and a visible flash on every visit.
//
// The gating decision lives here, as PURE functions: it runs in the
// middleware (hence on the edge runtime, with no access to the DOM or the
// database) and this is the only way to test it without starting Next.

// First segment of the routes reserved for a signed-in account. The ROLE
// check (admin, moderator…) stays on the Convex side: the middleware knows
// nothing about roles, it only decides "signed in or not".
export const PROTECTED_SEGMENTS = [
  'admin',
  'espace-membre',
  'espaces',
  'notifications',
] as const;

const LOCALES: readonly string[] = routing.locales;

// Splits a path into an optional locale + the rest. The middleware runs
// BEFORE next-intl's locale redirect: a request may arrive with or without
// a prefix, and both must be guarded.
function splitLocale(pathname: string): {
  locale: string | null;
  rest: string;
} {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.includes(segments[0])) {
    return { locale: segments[0], rest: segments.slice(1).join('/') };
  }
  return { locale: null, rest: segments.join('/') };
}

export function isProtectedPath(pathname: string): boolean {
  const { rest } = splitLocale(pathname);
  if (!rest) return false;
  const first = rest.split('/')[0];
  // Compare on the whole SEGMENT, never on a string prefix:
  // otherwise /administration or /espaces-verts would be locked by mistake.
  return (PROTECTED_SEGMENTS as readonly string[]).includes(first);
}

// Redirect target for a signed-out visitor. We keep the locale of the
// requested page: sending an English speaker to /fr/connexion would be an
// unrequested language switch.
export function signInPathFor(pathname: string): string {
  const { locale } = splitLocale(pathname);
  return `/${locale ?? routing.defaultLocale}/connexion`;
}
