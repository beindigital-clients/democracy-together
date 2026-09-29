import { v } from 'convex/values';
import { mutation, type MutationCtx } from './_generated/server';
import { RESET_PROVIDER_ID } from './otp';
import { MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR } from './lib/passwordPolicy';
import { sha256Hex } from './lib/totp';
import { EMAIL_MAX_LENGTH } from './lib/validation';

// "FORGOT PASSWORD", ONE QUESTION PER SCREEN: checking the code on its own.
//
// Convex Auth resets a password in a single call: `reset-verification` takes
// the code AND the new password, verifies the first, consumes it and sets the
// second. The screen therefore asked for everything at once — code, password
// and confirmation on one form. It now asks one question per screen (address,
// code, new password), and the code screen must be able to say "wrong code"
// BEFORE anyone chooses a password: otherwise that screen is a formality, and
// the error lands one screen too late.
//
// This mutation answers that question and nothing more. It does NOT consume
// the code and opens no session: the password step still calls
// `reset-verification`, which checks the code again and consumes it.
// Everything the library enforces — the password policy, invalidating the
// other sessions, refusing a suspended account — stays where it was.
//
// It REPLAYS, for the reset provider, the checks of Convex Auth's
// `verifyCodeOnly` (server/implementation/mutations/verifyCodeAndSignIn.js,
// 0.0.95), which the package does not export. That coupling is held by
// `convex/password-reset.test.ts`, which obtains its codes from the REAL reset
// flow: an upgrade that changes how codes are stored fails there, not in
// front of a member stuck on the code screen.
//
// A second door onto the code must not weaken the first:
//
// 1. NO EXTRA GUESSES. A wrong code counts against the SAME counter as the
//    library's own verification (`authRateLimits`, keyed on the address as
//    sent): the budget stays MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR failures an
//    hour, shared by this check, the reset itself and sign-in by code.
// 2. NO ENUMERATION. An address without a password account gets exactly what
//    a wrong code gets — `invalid`, then `tooManyAttempts` after the same
//    number of failures: failures are counted whether or not an account
//    exists, as the library does.

// What convex/otp.ts issues (`generateCode`): six digits.
const CODE_FORMAT = /^\d{6}$/;

const HOUR_MS = 60 * 60 * 1000;

export const checkCode = mutation({
  args: { email: v.string(), code: v.string() },
  returns: v.union(
    v.literal('valid'),
    v.literal('invalid'),
    v.literal('tooManyAttempts'),
  ),
  handler: async (ctx, { email, code }) => {
    // Input that can match no code is answered without a read or a write: an
    // oversized address would otherwise end up as a counter row.
    if (email.length > EMAIL_MAX_LENGTH || !CODE_FORMAT.test(code)) {
      return 'invalid';
    }
    const now = Date.now();
    const counter = await failureCounter(ctx, email, now);
    if (counter !== null && counter.attemptsLeft < 1) return 'tooManyAttempts';
    if (await isPendingResetCode(ctx, email, code, now)) return 'valid';

    // The failure is RETURNED, never thrown: an error would roll the count
    // back along with the rest of the transaction.
    if (counter === null) {
      await ctx.db.insert('authRateLimits', {
        identifier: email,
        attemptsLeft: MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR - 1,
        lastAttemptTime: now,
      });
    } else {
      await ctx.db.patch(counter.id, {
        attemptsLeft: counter.attemptsLeft - 1,
        lastAttemptTime: now,
      });
    }
    return 'invalid';
  },
});

// Convex Auth's failure counter for an identifier, plus the credit regained
// since the last failure — the arithmetic of the library's
// `getRateLimitState` (server/implementation/rateLimit.js): the credit comes
// back continuously, up to MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR. `null`: no
// failure on record, full credit.
async function failureCounter(
  ctx: MutationCtx,
  identifier: string,
  now: number,
) {
  const row = await ctx.db
    .query('authRateLimits')
    .withIndex('identifier', (q) => q.eq('identifier', identifier))
    .unique();
  if (row === null) return null;
  const perMs = MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR / HOUR_MS;
  return {
    id: row._id,
    attemptsLeft: Math.min(
      MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR,
      row.attemptsLeft + (now - row.lastAttemptTime) * perMs,
    ),
  };
}

// Would `reset-verification` accept this code for this address right now?
// `verifyCodeOnly`'s checks, in its order, minus the consumption.
async function isPendingResetCode(
  ctx: MutationCtx,
  email: string,
  code: string,
  now: number,
): Promise<boolean> {
  const hash = await sha256Hex(code);
  // `.unique()`, like the library: should two pending codes ever collide,
  // this check and the reset fail the same way.
  const stored = await ctx.db
    .query('authVerificationCodes')
    .withIndex('code', (q) => q.eq('code', hash))
    .unique();
  if (stored === null) return false;
  // A code sent by e-mail carries no PKCE verifier.
  if (stored.verifier !== undefined) return false;
  if (stored.expirationTime < now) return false;
  // Issued for a reset — not a sign-in or address-verification code.
  if (stored.provider !== RESET_PROVIDER_ID) return false;
  // ...and for THIS address, as the Email provider's `authorize` requires.
  // Only the Password provider's `reset` flow issues such a code (the reset
  // provider cannot be called directly), and it attaches it to the password
  // account it has just looked up: the address match is the account match.
  const account = await ctx.db.get(stored.accountId);
  return account !== null && account.providerAccountId === email;
}
