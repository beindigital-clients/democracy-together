import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getCurrentUser, requireUser, requireNetworkRole } from './lib/rbac';
import { networkRole, locale } from './schema';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';

// Utilisateur courant (null si non connecté) — pour l'en-tête et l'espace membre.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      role: user.role ?? 'visiteur',
      preferredLocale: user.preferredLocale ?? null,
    };
  },
});

// Préférence de langue côté profil (suit l'utilisateur sur tous ses appareils).
export const setPreferredLocale = mutation({
  args: { locale },
  handler: async (ctx, { locale: loc }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { preferredLocale: loc });
  },
});

// Attribution de rôle réseau (F-63) — réservé aux administrateurs, audité.
export const setRole = mutation({
  args: { userId: v.id('users'), role: networkRole },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireNetworkRole(ctx, 'admin');

    // Garde anti-lockout (F-63) : un admin ne peut pas se rétrograder lui-même,
    // et on ne retombe jamais à zéro administrateur (sinon plus personne ne peut
    // jamais réattribuer de rôle — verrouillage RBAC irréversible).
    if (role !== 'admin') {
      const target = await ctx.db.get(userId);
      if (target?.role === 'admin') {
        if (userId === admin._id) {
          throw new Error('Un administrateur ne peut pas se rétrograder lui-même.');
        }
        const admins = (await ctx.db.query('users').collect()).filter(
          (u) => u.role === 'admin',
        );
        if (admins.length <= 1) {
          throw new Error('Impossible de rétrograder le dernier administrateur.');
        }
      }
    }

    await ctx.db.patch(userId, { role });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.USER_ROLE_CHANGED,
      targetId: userId,
      metadata: { role },
    });
  },
});
