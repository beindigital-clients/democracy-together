import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { networkRole } from './schema';

// DEV/TEST UNIQUEMENT — internalMutation (HORS API publique, comme
// purgeUserByEmail) : invocable seulement depuis le serveur ou la CLI
// (`npx convex run`), JAMAIS par un client. Élève le rôle d'un utilisateur par
// e-mail pour amorcer un admin dans les tests E2E (setRole « réel » exige déjà
// un admin -> problème de l'œuf et de la poule). Double garde AUTH_DEV_OTP.
export const setRoleByEmail = internalMutation({
  args: { email: v.string(), role: networkRole },
  handler: async (ctx, { email, role }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    const user = (await ctx.db.query('users').collect()).find(
      (u) => u.email === email,
    );
    if (!user) throw new Error('Utilisateur introuvable.');
    await ctx.db.patch(user._id, { role });
    return { ok: true, role };
  },
});

// DEV/TEST UNIQUEMENT (garde AUTH_DEV_OTP) : purge complète d'un utilisateur
// par e-mail — compte Convex Auth, sessions, refresh tokens, codes. Permet de
// rejouer le flow d'inscription avec une vraie adresse déjà utilisée.
export const purgeUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    const user = (await ctx.db.query('users').collect()).find(
      (u) => u.email === email,
    );
    if (!user) return { deleted: false, reason: 'introuvable' };

    const accounts = (await ctx.db.query('authAccounts').collect()).filter(
      (a) => a.userId === user._id,
    );
    const accountIds = new Set(accounts.map((a) => a._id));
    const codes = (await ctx.db.query('authVerificationCodes').collect()).filter(
      (c) => accountIds.has(c.accountId),
    );
    for (const c of codes) await ctx.db.delete(c._id);
    for (const a of accounts) await ctx.db.delete(a._id);

    const sessions = (await ctx.db.query('authSessions').collect()).filter(
      (s) => s.userId === user._id,
    );
    const sessionIds = new Set(sessions.map((s) => s._id));
    const tokens = (await ctx.db.query('authRefreshTokens').collect()).filter(
      (t) => sessionIds.has(t.sessionId),
    );
    for (const t of tokens) await ctx.db.delete(t._id);
    for (const s of sessions) await ctx.db.delete(s._id);

    const devCodes = (await ctx.db.query('devOtpCodes').collect()).filter(
      (d) => d.email === email,
    );
    for (const d of devCodes) await ctx.db.delete(d._id);

    await ctx.db.delete(user._id);
    return { deleted: true };
  },
});

// DEV/TEST UNIQUEMENT (garde AUTH_DEV_OTP) : supprime les publications de test
// dont le titre contient `marker`, ainsi que leur fichier stocké. Permet à
// l'E2E de dépôt (F-32) de rester auto-suffisant — il publie une vraie
// publication, donc doit la retirer du dataset partagé (sinon il fausse le
// compteur de la bibliothèque). Marqueur >= 3 caractères pour éviter une purge
// accidentelle de masse.
export const deleteTestPublications = internalMutation({
  args: { marker: v.string() },
  handler: async (ctx, { marker }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    if (marker.trim().length < 3) throw new Error('Marqueur trop court.');
    const pubs = (await ctx.db.query('publications').collect()).filter((p) =>
      p.title.includes(marker),
    );
    let deleted = 0;
    for (const p of pubs) {
      if (p.fileId) {
        try {
          await ctx.storage.delete(p.fileId);
        } catch {
          /* fichier déjà absent : on poursuit la suppression du document */
        }
      }
      await ctx.db.delete(p._id);
      deleted++;
    }
    return { deleted };
  },
});
