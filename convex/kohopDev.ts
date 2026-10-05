import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { normalizeEmail } from './lib/onboarding';
import { SETTINGS_KEY } from './lib/kohopAccess';

// DEV/TEST ONLY — `internalMutation` (outside the public API) AND the
// `AUTH_DEV_OTP` guard, like `devAdmin.ts`: callable from the CLI or a
// trusted E2E fixture, never by a client, never in production.
//
// Builds a KOHOP PILOT in one call: an organization for the author (listed in
// the pilot), another one for the reviewers, directory profiles for everyone,
// and the pilot access setting. Idempotent: it reuses what exists.

function devOnly() {
  if (process.env.AUTH_DEV_OTP !== 'true') {
    throw new Error('Désactivé (AUTH_DEV_OTP).');
  }
}

async function userByEmail(
  ctx: { db: import('./_generated/server').MutationCtx['db'] },
  email: string,
) {
  return await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
    .first();
}

async function ensureOrg(
  ctx: { db: import('./_generated/server').MutationCtx['db'] },
  name: string,
  websiteUrl: string,
) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const existing = await ctx.db
    .query('organizations')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert('organizations', {
    name,
    slug,
    country: 'SN',
    region: 'afrique',
    languages: ['fr'],
    themes: [],
    websiteUrl,
    status: 'active',
    createdAt: Date.now(),
  });
}

export const seedPilot = internalMutation({
  args: {
    authorEmail: v.string(),
    reviewerEmails: v.array(v.string()),
    // `pilot` (default) lists the author's organization; `open` opens the
    // deposit to every member.
    access: v.optional(v.union(v.literal('pilot'), v.literal('open'))),
  },
  handler: async (ctx, { authorEmail, reviewerEmails, access }) => {
    devOnly();
    const author = await userByEmail(ctx, authorEmail);
    if (!author) throw new Error('Auteur introuvable.');
    // A test can be replayed: the author's KOHOP rate counters start afresh.
    for (const kind of ['draft', 'save']) {
      const counter = await ctx.db
        .query('rateLimits')
        .withIndex('by_key', (q) => q.eq('key', `kohop:${kind}:${author._id}`))
        .unique();
      if (counter) await ctx.db.delete(counter._id);
    }
    const authorOrg = await ensureOrg(
      ctx,
      'Institut Kohop Pilote',
      'https://pilote.example.org',
    );
    const reviewerOrg = await ensureOrg(
      ctx,
      'Centre Kohop Relecture',
      'https://relecture.example.org',
    );

    const attach = async (
      userId: typeof author._id,
      orgId: typeof authorOrg,
    ) => {
      const has = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_org_user', (q) =>
          q.eq('orgId', orgId).eq('userId', userId),
        )
        .first();
      if (!has) {
        await ctx.db.insert('organizationMemberships', {
          userId,
          orgId,
          orgRole: 'member',
          createdAt: Date.now(),
        });
      }
    };
    const profile = async (
      userId: typeof author._id,
      displayName: string,
      jobTitle: string,
      email: string,
    ) => {
      // A stale profile of an earlier seed under the same name would be found
      // first by a test looking the person up: it leaves the directory.
      const sameName = await ctx.db
        .query('memberProfiles')
        .filter((q) => q.eq(q.field('displayName'), displayName))
        .take(20);
      for (const other of sameName) {
        if (other.userId !== userId && other.listed) {
          await ctx.db.patch(other._id, { listed: false });
        }
      }
      const has = await ctx.db
        .query('memberProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first();
      if (has) {
        if (!has.listed) await ctx.db.patch(has._id, { listed: true });
        return;
      }
      // Unique per account: the e-mail's local part.
      const handle = normalizeEmail(email)
        .split('@')[0]
        .replace(/[^a-z0-9]+/g, '-');
      await ctx.db.insert('memberProfiles', {
        userId,
        handle,
        displayName,
        jobTitle,
        country: 'SN',
        themes: [],
        languages: ['fr'],
        links: [],
        visibility: 'members',
        messagePolicy: 'members',
        mutedNotificationTypes: [],
        messageEmail: false,
        listed: true,
        searchText: `${displayName} ${handle} ${jobTitle}`.toLowerCase(),
        nameKey: displayName.toLowerCase(),
        followerCount: 0,
        followingCount: 0,
        updatedAt: Date.now(),
      });
    };

    await attach(author._id, authorOrg);
    await profile(
      author._id,
      author.name ?? 'Awa Auteure',
      'Chercheuse',
      authorEmail,
    );
    const names = [
      ['Rémi Relecteur', 'Politiste'],
      ['Rita Relectrice', 'Juriste'],
      ['Samba Suppléant', 'Économiste'],
      ['Nadia Experte', 'Sociologue'],
    ];
    let i = 0;
    for (const email of reviewerEmails) {
      const user = await userByEmail(ctx, email);
      if (!user) throw new Error(`Relecteur introuvable : ${email}`);
      await attach(user._id, reviewerOrg);
      const [name, job] = names[i % names.length];
      await ctx.db.patch(user._id, { name });
      await profile(user._id, name, job, email);
      i += 1;
    }

    const settings = await ctx.db
      .query('kohopSettings')
      .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
      .unique();
    const row = {
      access: access ?? 'pilot',
      pilotOrganizations: [authorOrg],
      updatedAt: Date.now(),
    };
    if (settings) await ctx.db.patch(settings._id, row);
    else await ctx.db.insert('kohopSettings', { key: SETTINGS_KEY, ...row });
    return { authorOrg, reviewerOrg };
  },
});
