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

// A file at the DECISION stage with every kind of originality result and a
// reviewer with a links synthesis: what the review chief's screen has to show,
// built without running the whole journey. For the browser tests of that screen.
export const seedOriginalityDossier = internalMutation({
  args: {
    authorEmail: v.string(),
    reviewerEmail: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { authorEmail, reviewerEmail, title }) => {
    devOnly();
    const author = await userByEmail(ctx, authorEmail);
    const reviewer = await userByEmail(ctx, reviewerEmail);
    if (!author || !reviewer) throw new Error('Compte introuvable.');
    const now = Date.now();
    const body = `## Introduction\n\n${Array.from({ length: 560 }, (_, i) => ['participation', 'citoyenne', 'budget', 'local'][i % 4]).join(' ')}`;
    const id = await ctx.db.insert('kohopContributions', {
      stage: 'decision',
      authorUserId: author._id,
      lang: 'fr',
      fields: ['citizen-participation'],
      keywords: ['participation'],
      coAuthors: [],
      currentVersion: 1,
      submittedVersion: 1,
      reviewedVersion: 1,
      title,
      licence: 'CC BY 4.0',
      priorWorks: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('kohopVersions', {
      contributionId: id,
      version: 1,
      kind: 'submission',
      title,
      standfirst:
        'Un chapô de cent caractères au moins, qui résume la contribution en une ou deux phrases claires et utiles au lecteur.',
      body,
      links: [],
      wordCount: 560,
      createdBy: author._id,
      createdAt: now,
    });
    const reviewerId = await ctx.db.insert('kohopReviewers', {
      contributionId: id,
      slot: 'titular',
      source: 'directory',
      name: 'Rémi Relecteur',
      userId: reviewer._id,
      status: 'submitted',
      flags: ['external_cosign', 'external_affiliation'],
      remindersSent: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('kohopLinkChecks', {
      contributionId: id,
      reviewerId,
      level: 'flagged',
      findings: [
        {
          type: 'external_cosign',
          detail: '1 · Un article cosigné (2025)',
          source: 'OpenAlex',
          url: 'https://openalex.org/W1',
        },
        {
          type: 'external_affiliation',
          detail: 'Université de Dakar',
          source: 'ORCID',
          url: 'https://orcid.org/0000-0001-5109-370X',
        },
      ],
      origin: 'ai',
      model: 'anthropic/claude-sonnet-5',
      synthesis:
        'Les deux personnes ont cosigné un article en 2025 et ont travaillé dans la même université.',
      checkedAt: now,
    });
    await ctx.db.insert('originalityReports', {
      contributionId: id,
      version: 1,
      scope: 'platform',
      status: 'done',
      provider: 'platform',
      model: 'anthropic/claude-sonnet-5',
      summary: '3 passages, 12%',
      stages: [
        { stage: 'words', status: 'done' },
        { stage: 'semantic', status: 'done' },
        { stage: 'ai', status: 'failed', error: 'AI_GATEWAY_HTTP_ERROR' },
      ],
      matches: [
        {
          sourceType: 'publication',
          sourceTitle: 'Rapport sur le budget participatif',
          passage:
            'la participation citoyenne locale renforce la confiance dans les institutions',
          sourcePassage:
            'la participation citoyenne locale renforce la confiance dans les institutions publiques',
          lang: 'fr',
          sourceLang: 'fr',
          method: 'words',
          classification: 'borrowing',
          aiVerdict: 'same_text',
          aiClassification: 'borrowing',
          aiRationale: 'Le passage est repris mot pour mot.',
        },
        {
          sourceType: 'publication',
          sourceTitle: 'Citizen participation in West Africa',
          passage:
            'Les budgets participatifs rapprochent les habitants des décisions locales.',
          sourcePassage:
            'Participatory budgets bring residents closer to local decisions.',
          lang: 'fr',
          sourceLang: 'en',
          method: 'semantic',
          crossLanguage: true,
          similarity: 0.91,
          aiVerdict: 'translation',
          aiClassification: 'borrowing',
          aiRationale: 'Même phrase traduite de l’anglais.',
        },
        {
          sourceType: 'tribune',
          sourceTitle: 'Billet de la Tribune',
          passage: 'une formule courante sur la démocratie locale',
          sourcePassage: 'une formule courante sur la démocratie locale',
          lang: 'fr',
          sourceLang: 'fr',
          method: 'words',
          classification: 'common_phrase',
        },
      ],
      checkedAt: now,
    });
    await ctx.db.insert('originalityReports', {
      contributionId: id,
      version: 1,
      scope: 'external',
      status: 'unavailable',
      matches: [],
      provider: 'none',
      error: 'NO_PROVIDER',
      checkedAt: now,
    });
    return id;
  },
});
