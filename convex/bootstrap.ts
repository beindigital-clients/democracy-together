import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { recordAudit } from './lib/audit';
import { COUNTER, bumpCounter } from './lib/counters';
import { AUDIT } from './lib/auditActions';
import { normalizeEmail } from './lib/onboarding';
import { isEmail } from './lib/validation';

// Bootstrapping of the initial administrator (issue #47).
//
// The problem: on a new deployment, NO production path created the
// first administrator. `users.setRole` and `users.inviteUser` require an admin
// already signed in, `organizations.reviewApplication` only grants "membre", and
// `devAdmin.setRoleByEmail` is guarded by AUTH_DEV_OTP — a flag that is not
// isolated: it opens the ENTIRE development surface (OTP codes written in
// plaintext to `devOtpCodes` and read back by an oracle, demo seeds,
// seven read oracles, email sending that logs instead of failing).
// Enabling it, even for a few minutes in production, would undo the closing of
// those oracles (PR #4, P0-4).
//
// This mutation is therefore the PRODUCTION bootstrap path. What prevents it
// from becoming a permanent backdoor:
//
//  1. `internalMutation`: outside the public API — invocable from the server or the
//     CLI (`npx convex run`), never by a client.
//  2. BOOTSTRAP_ADMIN_EMAIL guard: its OWN environment variable,
//     independent of AUTH_DEV_OTP, so bootstrapping opens no other
//     surface. The address passed as an argument must match it: the variable
//     says whom the deployment authorizes, the argument says whom the operator meant.
//     A typo is rejected instead of promoting a third party.
//  3. "Zero admins" guard: as soon as an administrator exists, the mutation is
//     inoperative. It therefore only works once, on a new deployment. It is
//     this guard — and not removing the variable — that closes the door:
//     the variable can be removed right after bootstrapping, and even if left behind through
//     negligence it reopens nothing.
//
// The role is not a parameter: this function can only grant
// "admin". Any other assignment goes through `users.setRole`, audited and
// reserved to administrators.
//
// Procedure documented in docs/deploiement.md.
export const bootstrapAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // --- Guard 1: the deployment must explicitly designate the address ------
    const configured = process.env.BOOTSTRAP_ADMIN_EMAIL;
    if (!configured) {
      throw new Error(
        'BOOTSTRAP_ADMIN_NOT_CONFIGURED : définir BOOTSTRAP_ADMIN_EMAIL sur le déploiement Convex (npx convex env set BOOTSTRAP_ADMIN_EMAIL …).',
      );
    }
    // Same normalization as for the application and sign-in
    // (lowercase, no spaces): otherwise the account created here would never be
    // found by the `createOrUpdateUser` callback in convex/auth.ts, and the
    // comparison below would fail on a mere difference in case.
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) throw new Error('INVALID_EMAIL');
    if (normalized !== normalizeEmail(configured)) {
      throw new Error(
        "BOOTSTRAP_EMAIL_MISMATCH : l'adresse demandée ne correspond pas à BOOTSTRAP_ADMIN_EMAIL.",
      );
    }

    // --- Guard 2: not replayable ---------------------------------------------
    // A single administrator is enough to close the door for good.
    const existingAdmin = await ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', 'admin'))
      .first();
    if (existingAdmin) {
      throw new Error(
        'BOOTSTRAP_ALREADY_DONE : un administrateur existe déjà — passer par le back-office (users.setRole).',
      );
    }

    // UPSERT, for the same reason as `devAdmin.setRoleByEmail`: since the
    // removal of self-signup, no path creates an account on a
    // new deployment, so a plain `patch` would fail with "Utilisateur
    // introuvable". Creating the `users` row is enough to make the account
    // able to sign in — one-time-code sign-in does the rest, without
    // any code ever being stored in the database (see convex/otp.ts).
    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalized))
      .first();

    let userId: Id<'users'>;
    let created: boolean;
    if (existing) {
      await ctx.db.patch(existing._id, { role: 'admin' });
      userId = existing._id;
      created = false;
    } else {
      userId = await ctx.db.insert('users', {
        email: normalized,
        role: 'admin',
      });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      created = true;
    }

    // Audit (F-67), like `users.setRole`. No `actorId`: the operation comes
    // from the operations CLI, not from a platform account — designating the
    // new administrator as the author would suggest they promoted
    // themselves. `via` records the path taken.
    await recordAudit(ctx, {
      action: AUDIT.ADMIN_BOOTSTRAPPED,
      targetId: userId,
      metadata: { email: normalized, role: 'admin', created, via: 'bootstrap' },
    });

    return { ok: true as const, userId, created, email: normalized };
  },
});
