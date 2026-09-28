import { ConvexError } from 'convex/values';

// Rejection codes from the "comptes" workstream, read on the screen side.
//
// Convex passes a `ConvexError`'s DATA through to the client (even in
// production, unlike a bare `Error`'s message); sign-in, however,
// goes through `/api/auth`, which only relays the MESSAGE. So we read both:
// the data first, then the message, where the code appears delimited.

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

/** The first code from `known` carried by the error, or `null`. */
export function errorCode<C extends string>(
  err: unknown,
  known: readonly C[],
): C | null {
  if (err instanceof ConvexError && typeof err.data === 'string') {
    const data = err.data;
    const hit = known.find((code) => code === data);
    if (hit) return hit;
  }
  const message = messageOf(err);
  for (const code of known) {
    if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(message)) return code;
  }
  return null;
}

/** Sign-in refused because the account is suspended (convex/lib/signIn.ts). */
export function isAccountSuspended(err: unknown): boolean {
  return errorCode(err, ['ACCOUNT_SUSPENDED'] as const) !== null;
}
