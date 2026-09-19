import { v } from 'convex/values';
import { query, mutation, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { getCurrentUser, requireUser, requireNetworkRole } from './lib/rbac';
import { networkRole, locale } from './schema';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { isEmail } from './lib/validation';
import { normalizeEmail, invitationEmail } from './lib/onboarding';
import { sendEmail } from './email';

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

// --- Invitation manuelle (F-63) ---------------------------------------------
// Le back-office ne savait NI créer NI inviter un utilisateur (audit § 3.1
// F-63) : hors validation d'une candidature, il n'existait aucun moyen
// d'ouvrir un compte — pas même pour le secrétariat ou un modérateur. Comme
// l'auto-inscription est supprimée, c'était un cul-de-sac.
//
// Créer la ligne `users` suffit à rendre le compte connectable : le callback
// `createOrUpdateUser` de convex/auth.ts accepte un e-mail dès lors qu'un
// compte existe pour lui, et la connexion par code fait le reste.
export const inviteUser = mutation({
  args: { email: v.string(), role: networkRole },
  handler: async (ctx, { email, role }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) throw new Error('INVALID_EMAIL');

    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalized))
      .first();

    if (existing) {
      // Réinvitation : on renvoie l'e-mail mais on NE TOUCHE PAS au rôle — une
      // réinvitation ne doit jamais rétrograder un compte existant.
      await ctx.scheduler.runAfter(0, internal.users.sendAccountInvitation, {
        email: normalized,
      });
      return { created: false, userId: existing._id };
    }

    const userId = await ctx.db.insert('users', { email: normalized, role });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.USER_INVITED,
      targetId: userId,
      metadata: { email: normalized, role, via: 'admin' },
    });
    await ctx.scheduler.runAfter(0, internal.users.sendAccountInvitation, {
      email: normalized,
    });
    return { created: true, userId };
  },
});

// Envoi dans une ACTION (appel réseau interdit en mutation). Un échec d'envoi
// ne remet pas en cause la création du compte : l'invitation est renvoyable.
export const sendAccountInvitation = internalAction({
  args: { email: v.string() },
  handler: async (_ctx, { email }) => {
    const { subject, html } = invitationEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
    });
    await sendEmail({ to: email, subject, html });
  },
});
