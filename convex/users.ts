import { v } from 'convex/values';
import { query, mutation, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  getCurrentUser,
  requireUser,
  requireNetworkRole,
  effectiveRole,
} from './lib/rbac';
import { networkRole, locale } from './schema';
import { recordAudit } from './lib/audit';
import { COUNTER, bumpCounter } from './lib/counters';
import { AUDIT } from './lib/auditActions';
import { isEmail } from './lib/validation';
import { normalizeEmail, invitationEmail } from './lib/onboarding';
import { sendEmail } from './email';

// Current user (null if not signed in) — for the header and the member area.
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
      role: effectiveRole(user.role),
      preferredLocale: user.preferredLocale ?? null,
    };
  },
});

// Profile-side language preference (follows the user across all their devices).
export const setPreferredLocale = mutation({
  args: { locale },
  handler: async (ctx, { locale: loc }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { preferredLocale: loc });
  },
});

// Network role assignment (F-63) — reserved for administrators, audited.
export const setRole = mutation({
  args: { userId: v.id('users'), role: networkRole },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireNetworkRole(ctx, 'admin');

    // Anti-lockout guard (F-63): an admin cannot demote themselves,
    // and we never drop to zero administrators (otherwise no one could
    // ever reassign a role again — irreversible RBAC lockout).
    if (role !== 'admin') {
      const target = await ctx.db.get(userId);
      if (target?.role === 'admin') {
        if (userId === admin._id) {
          throw new Error(
            'Un administrateur ne peut pas se rétrograder lui-même.',
          );
        }
        // Via the `by_role` index, and without counting SUSPENDED
        // administrators (accounts workstream): a suspended administrator can
        // no longer reassign anything, so they do not protect against lockout.
        const admins = (
          await ctx.db
            .query('users')
            .withIndex('by_role', (q) => q.eq('role', 'admin'))
            .take(100)
        ).filter((u) => u.suspendedAt === undefined);
        if (admins.length <= 1) {
          throw new Error(
            'Impossible de rétrograder le dernier administrateur.',
          );
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

// --- Manual invitation (F-63) ---------------------------------------------
// The back office could NEITHER create NOR invite a user (audit § 3.1
// F-63): apart from approving an application, there was no way
// to open an account — not even for the secretariat or a moderator. Since
// self-registration has been removed, it was a dead end.
//
// Creating the `users` row is enough to make the account able to sign in: the
// `createOrUpdateUser` callback in convex/auth.ts accepts an email as long as an
// account exists for it, and code sign-in does the rest.
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
      // Re-invitation: we resend the email but DO NOT TOUCH the role — a
      // re-invitation must never demote an existing account.
      await ctx.scheduler.runAfter(0, internal.users.sendAccountInvitation, {
        email: normalized,
      });
      return { created: false, userId: existing._id };
    }

    const userId = await ctx.db.insert('users', { email: normalized, role });
    await bumpCounter(ctx, COUNTER.USERS, 1);
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

// Sending in an ACTION (network calls forbidden in mutations). A send failure
// does not undo the account creation: the invitation can be resent.
export const sendAccountInvitation = internalAction({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // AN INVITEE'S LANGUAGE IS NOT KNOWN IN ADVANCE. Unlike a membership
    // applicant, who filled out a form in a language, an account opened
    // from the back office has no signal — except a preference already set
    // if the address already had an account. We read it, and the fallback remains
    // French. Taking the language of the inviting ADMINISTRATOR would be worse:
    // it says nothing about the recipient's.
    const loc = await ctx.runQuery(internal.otp.localeForEmail, { email });
    const { subject, html } = invitationEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: loc ?? 'fr',
    });
    await sendEmail({ to: email, subject, html });
  },
});
