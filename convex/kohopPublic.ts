import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import {
  KOHOP_PUBLIC_EVENT_KINDS,
  KOHOP_PUBLIC_STAGES,
  kohopField,
  kohopLang,
  kohopRecommendation,
} from './lib/kohop';
import { countWords, readingMinutes } from './lib/kohopText';
import { getKohopSettings, versionOf } from './lib/kohopAccess';
import { displayedOrganization } from './lib/socialAccess';

// KOHOP — PUBLIC READS. Anyone can call these, so each answer is built FIELD BY
// FIELD (never by spreading a document) and frozen by a `returns` validator: a
// field added to a table does not reach the public by accident. A test
// serializes every answer and looks for what must never leave — an e-mail, a
// confidential note, a rejected reviewer, a working version, an originality
// report, a link check (plan § 5, rule 5).
//
// What is public: the published (or retracted) text, its authors, the signed
// analyses of the reviewers who consented, the author's reply, the dated path
// of the review, the version the reviewers read, the licence, the notice of a
// retraction. Nothing else.

const card = v.object({
  slug: v.string(),
  title: v.string(),
  standfirst: v.string(),
  lang: kohopLang,
  fields: v.array(kohopField),
  authors: v.array(v.object({ name: v.string() })),
  organization: v.union(
    v.null(),
    v.object({ name: v.string(), slug: v.string() }),
  ),
  publishedAt: v.number(),
  minutes: v.number(),
});

const publicReview = v.object({
  displayName: v.string(),
  affiliation: v.union(v.string(), v.null()),
  recommendation: kohopRecommendation,
  analysis: v.string(),
  submittedAt: v.number(),
});

const article = v.object({
  slug: v.string(),
  title: v.string(),
  standfirst: v.string(),
  body: v.string(),
  lang: kohopLang,
  fields: v.array(kohopField),
  keywords: v.array(v.string()),
  authors: v.array(
    v.object({ name: v.string(), affiliation: v.union(v.string(), v.null()) }),
  ),
  organization: v.union(
    v.null(),
    v.object({ name: v.string(), slug: v.string() }),
  ),
  publishedAt: v.number(),
  wordCount: v.number(),
  minutes: v.number(),
  licence: v.string(),
  links: v.array(
    v.object({
      label: v.string(),
      url: v.union(v.string(), v.null()),
      // A published library document: its page.
      publicationSlug: v.union(v.string(), v.null()),
    }),
  ),
  reviews: v.array(publicReview),
  response: v.union(v.string(), v.null()),
  path: v.array(v.object({ kind: v.string(), at: v.number() })),
  // The version the reviewers read, for "see the submitted version".
  submitted: v.union(
    v.null(),
    v.object({
      title: v.string(),
      standfirst: v.string(),
      body: v.string(),
    }),
  ),
  retraction: v.union(
    v.null(),
    v.object({ notice: v.string(), at: v.number() }),
  ),
});

const LIST_MAX = 100;

async function authorName(
  ctx: QueryCtx,
  file: Doc<'kohopContributions'>,
): Promise<string> {
  const profile = await ctx.db
    .query('memberProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', file.authorUserId))
    .unique();
  if (profile?.displayName) return profile.displayName;
  const user = await ctx.db.get(file.authorUserId);
  return user?.name?.trim() || '—';
}

async function toCard(ctx: QueryCtx, file: Doc<'kohopContributions'>) {
  const version = await versionOf(
    ctx,
    file._id,
    file.acceptedVersion ?? file.currentVersion,
  );
  if (!file.slug || !version || file.publishedAt === undefined) return null;
  return {
    slug: file.slug,
    title: version.title,
    standfirst: version.standfirst,
    lang: file.lang,
    fields: file.fields,
    authors: [{ name: await authorName(ctx, file) }],
    organization: await displayedOrganization(ctx, file.authorUserId),
    publishedAt: file.publishedAt,
    minutes: readingMinutes(version.wordCount),
  };
}

/** The published contributions, newest first, optionally by field and language. */
export const list = query({
  args: {
    field: v.optional(kohopField),
    lang: v.optional(kohopLang),
  },
  returns: v.array(card),
  handler: async (ctx, { field, lang }) => {
    const rows = await ctx.db
      .query('kohopContributions')
      .withIndex('by_stage_and_publishedAt', (q) => q.eq('stage', 'published'))
      .order('desc')
      .take(LIST_MAX);
    const out = [];
    for (const file of rows) {
      if (lang && file.lang !== lang) continue;
      if (field && !file.fields.includes(field)) continue;
      const c = await toCard(ctx, file);
      if (c) out.push(c);
    }
    return out;
  },
});

/** The contributions of one organization (its public page). */
export const byOrganization = query({
  args: { organizationSlug: v.string() },
  returns: v.array(card),
  handler: async (ctx, { organizationSlug }) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', organizationSlug))
      .unique();
    if (!org || org.status !== 'active') return [];
    const rows = await ctx.db
      .query('kohopContributions')
      .withIndex('by_stage_and_publishedAt', (q) => q.eq('stage', 'published'))
      .order('desc')
      .take(LIST_MAX);
    const out = [];
    for (const file of rows) {
      const displayed = await displayedOrganization(ctx, file.authorUserId);
      if (displayed?.slug !== org.slug) continue;
      const c = await toCard(ctx, file);
      if (c) out.push(c);
    }
    return out;
  },
});

/** One published (or retracted) contribution, by its permanent address. */
export const bySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), article),
  handler: async (ctx, { slug }) => {
    const file = await ctx.db
      .query('kohopContributions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!file || !KOHOP_PUBLIC_STAGES.includes(file.stage)) return null;
    const version = await versionOf(
      ctx,
      file._id,
      file.acceptedVersion ?? file.currentVersion,
    );
    if (!version || file.publishedAt === undefined) return null;

    // Signed analyses: only reviewers who SUBMITTED and CONSENTED. A reviewer
    // who was rejected or never answered has no analysis to show.
    const reviewerRows = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
      .take(30);
    const consenting = new Set(
      reviewerRows
        .filter((r) => r.status === 'submitted' && r.publicationConsentAt)
        .map((r) => r._id),
    );
    const reviewRows = await ctx.db
      .query('kohopReviews')
      .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
      .take(10);
    const reviews = reviewRows
      .filter((r) => consenting.has(r.reviewerId))
      .map((r) => ({
        displayName: r.displayName,
        affiliation: r.affiliation ?? null,
        recommendation: r.recommendation,
        analysis: r.analysis,
        submittedAt: r.submittedAt,
      }));

    const events = await ctx.db
      .query('kohopEvents')
      .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
      .take(200);
    const path = events
      .filter((e) => KOHOP_PUBLIC_EVENT_KINDS.includes(e.kind))
      .map((e) => ({ kind: e.kind, at: e.at }))
      .sort((a, b) => a.at - b.at);

    // The reply is the one handed in WITH the revision.
    const handedIn = file.submittedVersion
      ? await versionOf(ctx, file._id, file.submittedVersion)
      : null;
    const read =
      file.reviewedVersion !== undefined
        ? await versionOf(ctx, file._id, file.reviewedVersion)
        : null;

    const authors = [
      {
        name: await authorName(ctx, file),
        affiliation:
          (await displayedOrganization(ctx, file.authorUserId))?.name ?? null,
      },
      // Co-authors: name and affiliation. Their e-mail never leaves.
      ...file.coAuthors.map((c) => ({
        name: c.name,
        affiliation: c.affiliation || null,
      })),
    ];

    const links = [];
    for (const l of version.links) {
      let publicationSlug: string | null = null;
      if (l.publicationId) {
        const pub = await ctx.db.get(l.publicationId);
        // Only a PUBLISHED document is linked; anything else shows as a label.
        if (pub?.status === 'published') publicationSlug = pub.slug;
      }
      links.push({ label: l.label, url: l.url ?? null, publicationSlug });
    }

    return {
      slug: file.slug as string,
      title: version.title,
      standfirst: version.standfirst,
      body: version.body,
      lang: file.lang,
      fields: file.fields,
      keywords: file.keywords,
      authors,
      organization: await displayedOrganization(ctx, file.authorUserId),
      publishedAt: file.publishedAt,
      wordCount: version.wordCount || countWords(version.body),
      minutes: readingMinutes(version.wordCount),
      licence: file.licence,
      links,
      reviews,
      response: handedIn?.responseToReviewers ?? null,
      path,
      submitted: read
        ? {
            title: read.title,
            standfirst: read.standfirst,
            body: read.body,
          }
        : null,
      retraction: file.retraction
        ? { notice: file.retraction.notice, at: file.retraction.at }
        : null,
    };
  },
});

/**
 * Is the public KOHOP space open to search engines? Only a boolean leaves: not
 * the setting, not the list of pilot organizations. While the access is the
 * `pilot` one, the pages carry `noindex`.
 */
export const indexable = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const settings = await getKohopSettings(ctx);
    return settings.access === 'open';
  },
});
