// Reading Convex Auth rejections on the screen side.
//
// `signIn` (Convex Auth's Next.js client) relays the server's raw message:
// `/api/auth` responds `{ error: error.message }` and the client rethrows it as
// is (`throw new Error(json.error)`). The screens caught everything in one block
// and answered "incorrect" or "une erreur est survenue" — including for the
// anti-brute-force lock, which ALSO rejects the correct secret, and for the
// code-sending cap (measured on 27/09). These two cases have their own message; this
// module is the only place that knows the server's wording.

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

// Convex Auth lock after too many failures (password or code): the correct
// secret is rejected during the window, and that must be said.
export function isTooManyAttempts(error: unknown): boolean {
  return /TooManyFailedAttempts/.test(message(error));
}

// Code-sending cap (convex/otp.ts -> enforceSendRate) or general rate
// limit: requesting a code again will do nothing before the window ends.
export function isSendLimited(error: unknown): boolean {
  return /RATE_LIMITED|TooManyVerificationAttempts/.test(message(error));
}
