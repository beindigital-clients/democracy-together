import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { COUNTER, bumpCounter, trackPublicationStatus } from './lib/counters';
import { networkRole } from './schema';
import { normalizeEmail } from './lib/onboarding';
import { publicationSearchText } from './lib/searchText';

// DEV/TEST ONLY — internalMutation (OUTSIDE the public API, like
// purgeUserByEmail): callable only from the server or the CLI
// (`npx convex run`), NEVER by a client. Double guard AUTH_DEV_OTP.
//
// UPSERT (no longer a plain patch): since self-registration was removed,
// no code path created accounts anymore, so this function — the only
// documented way to bootstrap the initial administrator — always failed
// with "Utilisateur introuvable". It now creates the account if needed,
// which unblocks both the admin bootstrap and the E2E fixtures.
//
// The e-mail is normalized exactly as at sign-up and sign-in
// (lowercase, no spaces): otherwise the account created here would never
// be found by the createOrUpdateUser callback in convex/auth.ts.
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
      await bumpCounter(ctx, COUNTER.USERS, 1);
      return { ok: true, role, created: true, userId: id };
    }
    await ctx.db.patch(user._id, { role });
    return { ok: true, role, created: false, userId: user._id };
  },
});

// DEV/TEST ONLY (AUTH_DEV_OTP guard): REMOVES the `role` column from an
// account, reproducing a legacy account — created before `reviewApplication`
// and `inviteUser` always set a role (PR #4).
//
// It is the only state the E2E fixtures could not produce:
// `setRoleByEmail` always sets a role. Yet it is precisely the one the
// back office displayed wrongly (issue #27) — "membre" for an account the
// server treats as "visiteur". Without this helper, the screen cannot be
// tested in the state that broke it.
//
// `patch` with `undefined` DELETES the field (it does not write null): the
// row becomes exactly that of an account from before PR #4.
export const clearRoleByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    const normalized = normalizeEmail(email);
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalized))
      .first();
    if (!user) throw new Error('Utilisateur introuvable.');
    await ctx.db.patch(user._id, { role: undefined });
    return { ok: true, userId: user._id };
  },
});

// DEV/TEST ONLY (AUTH_DEV_OTP guard): full purge of a user
// by e-mail — Convex Auth account, sessions, refresh tokens, codes. Makes it
// possible to replay the sign-up flow with a real address already in use.
export const purgeUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    // Indexed read (`email` index of `users`), like setRoleByEmail and like
    // the sign-in callback: no code path scans `users` by e-mail
    // anymore. Exact match, no normalization — this is a purge, it must
    // target the requested address and that one only.
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    if (!user) return { deleted: false, reason: 'introuvable' };

    const accounts = (await ctx.db.query('authAccounts').collect()).filter(
      (a) => a.userId === user._id,
    );
    const accountIds = new Set(accounts.map((a) => a._id));
    const codes = (
      await ctx.db.query('authVerificationCodes').collect()
    ).filter((c) => accountIds.has(c.accountId));
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
    await bumpCounter(ctx, COUNTER.USERS, -1);
    return { deleted: true };
  },
});

// DEV/TEST ONLY (AUTH_DEV_OTP guard): deletes the test publications
// whose title contains `marker`, along with their stored file. Lets the
// submission E2E (F-32) stay self-contained — it publishes a real
// publication, so it must remove it from the shared dataset (otherwise it
// skews the library counter). Marker >= 3 characters to avoid an accidental
// mass purge.
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
      // The views row follows the publication: otherwise a future
      // publication reusing the identifier would inherit a count.
      const views = await ctx.db
        .query('publicationViews')
        .withIndex('by_publication', (q) => q.eq('publicationId', p._id))
        .unique();
      if (views) await ctx.db.delete(views._id);

      // Translations of the record (convex/translation.ts) — one per reading
      // language. They carry the full text: leaving them behind a deleted
      // publication means keeping the content we just erased.
      const translations = await ctx.db
        .query('contentTranslations')
        .withIndex('by_source', (q) =>
          q.eq('sourceType', 'publication').eq('sourceId', p._id),
        )
        .take(8);
      for (const tr of translations) await ctx.db.delete(tr._id);

      // Document extracted from the PDF (convex/documents.ts) and its translated
      // versions. IMAGES ARE FILES: forgetting them would leave in storage
      // illustrations that no row references anymore —
      // a slow leak, the kind you only notice on the bill.
      const extraction = await ctx.db
        .query('documentExtractions')
        .withIndex('by_publication', (q) => q.eq('publicationId', p._id))
        .unique();
      if (extraction) {
        for (const img of extraction.images ?? []) {
          try {
            await ctx.storage.delete(img.storageId);
          } catch {
            /* fichier déjà absent : on poursuit */
          }
        }
        const renditions = await ctx.db
          .query('documentRenditions')
          .withIndex('by_extraction', (q) =>
            q.eq('extractionId', extraction._id),
          )
          .take(16);
        for (const r of renditions) await ctx.db.delete(r._id);
        await ctx.db.delete(extraction._id);
      }

      await trackPublicationStatus(ctx, p.status, null);
      await ctx.db.delete(p._id);
      deleted++;
    }
    return { deleted };
  },
});

// DEV/TEST ONLY (AUTH_DEV_OTP guard): enriches a publication (body /
// key points / image / metadata / impact counters) found by its title.
// The submission form (F-32) collects neither the body nor the image; this
// helper gives rich content to DEMONSTRATION publications.
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
    {
      marker,
      body,
      keypoints,
      image,
      pages,
      license,
      doi,
      downloads,
      citations,
      views,
    },
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
      // Key points are part of the search haystack: fixing it
      // without recomputing it would leave the index on the old text.
      await ctx.db.patch(p._id, {
        ...patch,
        ...(keypoints !== undefined
          ? { searchText: publicationSearchText({ ...p, keypoints }) }
          : {}),
      });
      patched++;
    }
    return { patched };
  },
});
