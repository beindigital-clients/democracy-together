import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { networkRole } from './schema';
import { normalizeEmail } from './lib/onboarding';

// DEV/TEST UNIQUEMENT — internalMutation (HORS API publique, comme
// purgeUserByEmail) : invocable seulement depuis le serveur ou la CLI
// (`npx convex run`), JAMAIS par un client. Double garde AUTH_DEV_OTP.
//
// UPSERT (et non plus simple patch) : depuis la suppression de
// l'auto-inscription, plus aucun chemin ne créait de compte, donc cette
// fonction — le seul moyen documenté d'amorcer l'administrateur initial —
// échouait systématiquement sur « Utilisateur introuvable ». Elle crée
// désormais le compte si besoin, ce qui débloque à la fois l'amorçage de
// l'admin et les fixtures E2E.
//
// L'e-mail est normalisé exactement comme à l'inscription et à la connexion
// (minuscules, sans espaces) : sinon le compte créé ici ne serait jamais
// retrouvé par le callback createOrUpdateUser de convex/auth.ts.
export const setRoleByEmail = internalMutation({
  args: { email: v.string(), role: networkRole },
  handler: async (ctx, { email, role }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    const normalized = normalizeEmail(email);
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalized))
      .first();
    if (!user) {
      const id = await ctx.db.insert('users', { email: normalized, role });
      return { ok: true, role, created: true, userId: id };
    }
    await ctx.db.patch(user._id, { role });
    return { ok: true, role, created: false, userId: user._id };
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

// DEV/TEST UNIQUEMENT (garde AUTH_DEV_OTP) : enrichit une publication (corps /
// points clés / image / métadonnées / compteurs d'impact) repérée par son titre.
// Le formulaire de dépôt (F-32) ne collecte ni le corps ni l'image ; ce helper
// sert à donner un contenu étoffé aux publications de DÉMONSTRATION.
export const enrichPublication = internalMutation({
  args: {
    marker: v.string(),
    body: v.optional(v.array(v.string())),
    keypoints: v.optional(v.array(v.string())),
    image: v.optional(v.string()),
    pages: v.optional(v.number()),
    license: v.optional(v.string()),
    doi: v.optional(v.string()),
    downloads: v.optional(v.number()),
    citations: v.optional(v.number()),
    views: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { marker, body, keypoints, image, pages, license, doi, downloads, citations, views },
  ) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    if (marker.trim().length < 3) throw new Error('Marqueur trop court.');
    const patch: Partial<{
      body: string[];
      keypoints: string[];
      image: string;
      pages: number;
      license: string;
      doi: string;
      downloads: number;
      citations: number;
      views: number;
    }> = {};
    if (body !== undefined) patch.body = body;
    if (keypoints !== undefined) patch.keypoints = keypoints;
    if (image !== undefined) patch.image = image;
    if (pages !== undefined) patch.pages = pages;
    if (license !== undefined) patch.license = license;
    if (doi !== undefined) patch.doi = doi;
    if (downloads !== undefined) patch.downloads = downloads;
    if (citations !== undefined) patch.citations = citations;
    if (views !== undefined) patch.views = views;
    const pubs = (await ctx.db.query('publications').collect()).filter((p) =>
      p.title.includes(marker),
    );
    let patched = 0;
    for (const p of pubs) {
      await ctx.db.patch(p._id, patch);
      patched++;
    }
    return { patched };
  },
});
