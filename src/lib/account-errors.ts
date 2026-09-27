import { ConvexError } from 'convex/values';

// Codes de refus du chantier « comptes », lus côté écran.
//
// Convex fait traverser jusqu'au client la DONNÉE d'une `ConvexError` (même en
// production, contrairement au message d'une `Error` nue) ; la connexion, elle,
// passe par `/api/auth`, qui ne relaie que le MESSAGE. On lit donc les deux :
// la donnée d'abord, puis le message, où le code apparaît délimité.

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

/** Le premier code de `known` porté par l'erreur, ou `null`. */
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

/** Connexion refusée parce que le compte est suspendu (convex/lib/signIn.ts). */
export function isAccountSuspended(err: unknown): boolean {
  return errorCode(err, ['ACCOUNT_SUSPENDED'] as const) !== null;
}
