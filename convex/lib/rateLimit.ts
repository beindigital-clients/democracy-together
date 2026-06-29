import { ConvexError } from 'convex/values';
import type { MutationCtx } from '../_generated/server';

// Limiteur de débit (sécurité — défense en profondeur) contre le spam / abus
// sur les endpoints publics. Profil de menace : pics pendant un sommet,
// contributeurs en zones sensibles. Fenêtre FIXE : un compteur par clé, remis à
// zéro quand la fenêtre est dépassée.
//
// Clé = identifiant d'acteur : e-mail pour les endpoints anonymes (contact,
// adhésion), userId pour les endpoints authentifiés (dépôt, upload).
//
// LIMITES : la clé e-mail est usurpable et ne couvre pas un DDoS distribué. Le
// blindage réseau (anti-DDoS, rate-limit par IP) se fait à la couche edge/CDN
// au déploiement. Ceci stoppe les abus naïfs et borne l'usage par acteur.
//
// Sur dépassement : ConvexError('RATE_LIMITED') — `data` traverse jusqu'au
// client (contrairement à un Error nu, masqué en prod), pour un message dédié.
export type RateLimitRule = { key: string; max: number; windowMs: number };

export async function enforceRateLimit(
  ctx: MutationCtx,
  { key, max, windowMs }: RateLimitRule,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();

  if (!existing) {
    await ctx.db.insert('rateLimits', { key, count: 1, windowStart: now });
    return;
  }
  if (now - existing.windowStart >= windowMs) {
    // Fenêtre expirée -> nouvelle fenêtre.
    await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    return;
  }
  if (existing.count >= max) {
    throw new ConvexError('RATE_LIMITED');
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

const HOUR = 60 * 60 * 1000;

// Barèmes centralisés (généreux : un usage humain normal ne les atteint pas).
export const RATE_LIMITS = {
  contact: { max: 5, windowMs: HOUR },
  apply: { max: 5, windowMs: HOUR },
  newsletter: { max: 5, windowMs: HOUR },
  // Envoi de codes OTP / vérification / reset par e-mail (anti email-bombing :
  // l'envoi part vers une adresse fournie par l'appelant). Généreux pour un
  // usage humain (inscription + un renvoi + reset), strict contre l'abus.
  otpSend: { max: 8, windowMs: HOUR },
  eventRegister: { max: 10, windowMs: HOUR },
  tribunePost: { max: 10, windowMs: HOUR },
  tribuneComment: { max: 40, windowMs: HOUR },
  tribuneReport: { max: 20, windowMs: HOUR },
  publicationSubmit: { max: 10, windowMs: 24 * HOUR },
  projectSubmit: { max: 5, windowMs: 24 * HOUR },
  workspaceCreate: { max: 10, windowMs: 24 * HOUR },
  workspaceNote: { max: 60, windowMs: HOUR },
  upload: { max: 30, windowMs: HOUR },
} as const;
