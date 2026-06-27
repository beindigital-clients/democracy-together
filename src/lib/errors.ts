import { ConvexError } from 'convex/values';

// Détecte le dépassement de limite de débit renvoyé par le serveur
// (convex/lib/rateLimit.ts -> ConvexError('RATE_LIMITED')). `data` traverse
// jusqu'au client, contrairement au message d'un Error nu (masqué en prod).
export function isRateLimited(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'RATE_LIMITED';
}
