// Lecture des refus de Convex Auth côté écran.
//
// `signIn` (client Next.js de Convex Auth) relaie le message brut du serveur :
// `/api/auth` répond `{ error: error.message }` et le client le relance tel
// quel (`throw new Error(json.error)`). Les écrans attrapaient tout d'un bloc
// et répondaient « incorrect » ou « une erreur est survenue » — y compris au
// verrou anti-force-brute, qui refuse AUSSI le bon secret, et au plafond
// d'envoi de codes (mesuré le 27/09). Ces deux cas ont leur message ; ce
// module est le seul endroit qui connaît les libellés du serveur.

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

// Verrou de Convex Auth après trop d'échecs (mot de passe ou code) : le bon
// secret est refusé pendant la fenêtre, il faut le dire.
export function isTooManyAttempts(error: unknown): boolean {
  return /TooManyFailedAttempts/.test(message(error));
}

// Plafond d'envoi de codes (convex/otp.ts -> enforceSendRate) ou limite de
// débit générale : redemander un code ne servira à rien avant la fenêtre.
export function isSendLimited(error: unknown): boolean {
  return /RATE_LIMITED|TooManyVerificationAttempts/.test(message(error));
}
