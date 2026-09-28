import { ConvexError } from 'convex/values';

// Password policy (security — finding M4). Values CHOSEN, not
// endured: without these options, Convex Auth applies its own defaults
// (8 characters, 10 failures per hour), which are written nowhere and hence
// never reviewed.
//
// Particular threat profile here: there is NO self-registration. An account
// is born from a membership approval or an administrator invitation — so they
// are all valuable accounts (representatives of member organizations,
// secretariat, moderation), with no population of throwaway accounts to dilute an
// attack. Add to that the absence of a second factor: for an account that has one,
// the password is the only line of defense.
//
// LIMITATION: a real "this password has already leaked" check would require
// a large dataset or a network call on every entry. Out of scope
// here; what follows is a floor, not a strength audit.

// 12 characters rather than a composition requirement (uppercase + digit +
// symbol): for equal inconvenience to the user, length costs the attacker
// far more, whereas composition rules mostly produce predictable
// substitutions ("Motdepasse1!") and passwords written down on
// paper. Shared with the interface (the forms' `minLength` attribute)
// so that the browser refuses what the server would refuse.
export const PASSWORD_MIN_LENGTH = 12;

// Cap on sign-in failures per hour — Convex Auth's `maxFailedAttempsPerHour`
// (library default: 10). 5, because this is not a
// lockout: the credit replenishes continuously, i.e. one more attempt
// every 12 minutes. The two sign-in paths have SEPARATE counters —
// password (key: the account) and one-time code (key:
// the e-mail): someone who exhausts their credit typing a wrong password
// keeps code sign-in, they are not locked out. On the six-digit code
// side, 5 attempts per hour make random guessing pointless.
export const MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR = 5;

// The most common passwords, lowercased. List deliberately short
// and focused on those that would SURVIVE the length floor: the short
// classics ("azerty", "123456") are already refused by PASSWORD_MIN_LENGTH;
// they are listed here anyway so the list stays true if the floor
// moves. The last entries are the obvious ones specific to this project — the
// first password one tries against a known account is the site's name.
const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  '123456789012',
  '1234567890123',
  'azerty',
  'azertyuiop',
  'azertyuiop123',
  'qwerty',
  'qwertyuiop',
  'qwertyuiop123',
  'abcd1234',
  'abcdefghijkl',
  'abcdefghijklm',
  'motdepasse',
  'motdepasse1',
  'motdepasse123',
  'monmotdepasse',
  'password',
  'password1',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd123',
  'administrateur',
  'administrator',
  'adminadmin123',
  'welcome123',
  'bienvenue123',
  'letmein123',
  'iloveyou123',
  'trustno1234',
  'changeme123',
  'democracy',
  'democracy123',
  'democracytogether',
  'democracytogether1',
  'democracy-together',
]);

// A single repeated character clears the length floor while being worthless
// ("aaaaaaaaaaaa"): it is the most immediate loophole against a rule
// that only talks about length, hence the one to close along with it.
const SINGLE_REPEATED_CHARACTER = /^(.)\1*$/;

// Which rule breaks, without throwing — the shape the INTERFACE needs.
//
// The form cannot learn the reason for refusal from the server error:
// the application goes through `ConvexAuthNextjsProvider`, hence through the
// /api/auth route, and `@convex-dev/auth` converts a ConvexError there into
// `new Response(null, { status, statusText: error.data })`. The body is null,
// `data` is flattened into status text, and the browser only receives an
// ordinary error. The form therefore applies the same rule before calling
// the server — exactly what `minLength` already does for length.
//
// This is NOT client-side validation in the weak sense: the server always
// refuses, through `validatePasswordRequirements` below. The client only
// says WHY, where the network no longer lets it through.
export type PasswordRefusal = 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_COMMON';

export function passwordRefusal(password: string): PasswordRefusal | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return 'PASSWORD_TOO_SHORT';
  }
  if (
    COMMON_PASSWORDS.has(password.toLowerCase()) ||
    SINGLE_REPEATED_CHARACTER.test(password)
  ) {
    // EXACT comparison, never "contains": refusing
    // "motdepasse-de-mon-chat-2019" on the grounds that it contains "motdepasse"
    // would be hostile to an otherwise strong password.
    return 'PASSWORD_TOO_COMMON';
  }
  return null;
}

// Called by the Password provider on the "signUp" and
// "reset-verification" flows (`validatePasswordRequirements` option) — hence everywhere
// a password is SET, never at sign-in: an existing password
// that became non-compliant locks no one out, it gets fixed at the next
// change.
//
// This is where the policy is ENFORCED. The form's check only
// duplicates this one for the message; removing it would open nothing.
export function validatePasswordRequirements(password: string): void {
  const refus = passwordRefusal(password);
  if (refus) throw new ConvexError(refus);
}
