import { v, ConvexError } from 'convex/values';
import { query, mutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { enforceRateLimit } from './lib/rateLimit';
import { isEmail } from './lib/validation';
import { normalizeEmail } from './lib/onboarding';
import { normalizeSearchTerm } from './lib/search';
import { organizationOfAuthor } from './lib/orgMembership';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { displayedOrganization } from './lib/socialAccess';
import {
  KOHOP_ACTIVE_REVIEWER_STATUSES,
  KOHOP_BOUNDS,
  KOHOP_CHARTER_VERSION,
  KOHOP_LICENCE,
  eventsFor,
  kohopLang,
  normalizeFields,
  type KohopEvent,
} from './lib/kohop';
import { countWords, isHttpsUrl, validateBody } from './lib/kohopText';
import {
  advance,
  assertCanDeposit,
  canDeposit,
  getKohopSettings,
  recordKohopEvent,
  requireOwnContribution,
  versionOf,
} from './lib/kohopAccess';
import { collectLinkFacts } from './lib/kohopLinkFacts';
import {
  evaluateLinks,
  isDeclaredRelationship,
  linkLevel,
} from './lib/kohopLinks';

// KOHOP — the AUTHOR's side: draft, designation of the reviewers, submission,
// withdrawal. Every guard is here, server-side; the screens only reflect what
// the server allows. The review chief's side is in `convex/kohopChief.ts`.
//
// Someone else's file reads as NON-EXISTENT (`NOT_FOUND`). Business refusals
// are `ConvexError`s with a stable code, translated by the interface.

const HOUR = 60 * 60 * 1000;
const MAX_OPEN_DRAFTS = 5;
const BODY_MAX_CHARS = 12_000;

const coAuthorArg = v.object({
  name: v.string(),
  affiliation: v.string(),
  email: v.optional(v.string()),
});
const linkArg = v.object({
  label: v.string(),
  url: v.optional(v.string()),
  publicationId: v.optional(v.id('publications')),
});

function refuse(code: string): never {
  throw new ConvexError(code);
}

const EDITABLE: readonly Doc<'kohopContributions'>['stage'][] = [
  'draft',
  'returned',
];

// Stages in which a freed place can be refilled: the author designates a
// replacement, which the review chief then approves.
const REPLACEMENT_STAGES: readonly Doc<'kohopContributions'>['stage'][] = [
  'submitted',
  'in_review',
  'revision',
];

// --- Access -------------------------------------------------------------------

/** Can this account deposit now (pilot access), and under which mode? */
export const myAccess = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const settings = await getKohopSettings(ctx);
    return {
      access: settings.access,
      canDeposit: await canDeposit(ctx, user._id),
    };
  },
});

// --- Cleaning of the fields ---------------------------------------------------

type CleanFields = {
  title: string;
  standfirst: string;
  body: string;
  lang: 'fr' | 'en';
  fields: ReturnType<typeof normalizeFields>;
  keywords: string[];
  coAuthors: { name: string; affiliation: string; email?: string }[];
  links: { label: string; url?: string; publicationId?: Id<'publications'> }[];
  priorWorks: string[];
};

async function cleanFields(
  ctx: QueryCtx | MutationCtx,
  args: {
    title: string;
    standfirst: string;
    body: string;
    lang: 'fr' | 'en';
    fields: string[];
    keywords: string[];
    coAuthors: { name: string; affiliation: string; email?: string }[];
    links: {
      label: string;
      url?: string;
      publicationId?: Id<'publications'>;
    }[];
    priorWorks: string[];
  },
): Promise<CleanFields> {
  const B = KOHOP_BOUNDS;
  const title = args.title.trim().replace(/\s+/g, ' ');
  const standfirst = args.standfirst.trim();
  if (title.length > B.title.max) refuse('INVALID_TITLE');
  if (standfirst.length > B.standfirst.max) refuse('INVALID_STANDFIRST');
  if (args.body.length > BODY_MAX_CHARS) refuse('BODY_TOO_LONG');

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of args.keywords) {
    const k = raw.trim().slice(0, B.keywords.each);
    if (k && !seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase());
      keywords.push(k);
    }
  }
  if (keywords.length > B.keywords.max) refuse('INVALID_KEYWORDS');

  if (args.coAuthors.length > B.coAuthors.max) refuse('INVALID_COAUTHORS');
  const coAuthors = args.coAuthors.map((c) => {
    const name = c.name.trim();
    const affiliation = c.affiliation.trim();
    const email = c.email ? normalizeEmail(c.email) : undefined;
    if (
      !name ||
      name.length > B.coAuthors.name ||
      affiliation.length > B.coAuthors.affiliation ||
      (email && !isEmail(email))
    ) {
      refuse('INVALID_COAUTHORS');
    }
    return { name, affiliation, ...(email ? { email } : {}) };
  });

  if (args.links.length > B.links.max) refuse('INVALID_LINKS');
  const links: CleanFields['links'] = [];
  for (const l of args.links) {
    const label = l.label.trim();
    if (!label || label.length > B.links.label) refuse('INVALID_LINKS');
    if (l.publicationId) {
      const pub = await ctx.db.get(l.publicationId);
      // Only a PUBLISHED library document can be linked.
      if (!pub || pub.status !== 'published') refuse('INVALID_LINKS');
      links.push({ label, publicationId: l.publicationId });
    } else {
      const url = (l.url ?? '').trim();
      if (!isHttpsUrl(url) || url.length > B.links.url) refuse('INVALID_LINKS');
      links.push({ label, url });
    }
  }

  const priorWorks = args.priorWorks
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, B.priorWorks.max);
  if (priorWorks.some((w) => w.length > B.priorWorks.each))
    refuse('INVALID_PRIOR_WORKS');

  return {
    title,
    standfirst,
    body: args.body,
    lang: args.lang,
    fields: normalizeFields(args.fields),
    keywords,
    coAuthors,
    links,
    priorWorks,
  };
}

// --- Draft --------------------------------------------------------------------

export const createDraft = mutation({
  args: { lang: kohopLang },
  returns: v.id('kohopContributions'),
  handler: async (ctx, { lang }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    await assertCanDeposit(ctx, user._id);
    await enforceRateLimit(ctx, {
      key: `kohop:draft:${user._id}`,
      max: 10,
      windowMs: HOUR,
    });
    const open = await ctx.db
      .query('kohopContributions')
      .withIndex('by_author', (q) => q.eq('authorUserId', user._id))
      .take(100);
    if (open.filter((c) => c.stage === 'draft').length >= MAX_OPEN_DRAFTS) {
      refuse('TOO_MANY_DRAFTS');
    }

    const now = Date.now();
    const id = await ctx.db.insert('kohopContributions', {
      stage: 'draft',
      authorUserId: user._id,
      organizationId: (await organizationOfAuthor(ctx, user._id)) ?? undefined,
      lang,
      fields: [],
      keywords: [],
      coAuthors: [],
      currentVersion: 1,
      title: '',
      licence: KOHOP_LICENCE,
      priorWorks: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('kohopVersions', {
      contributionId: id,
      version: 1,
      kind: 'submission',
      title: '',
      standfirst: '',
      body: '',
      links: [],
      wordCount: 0,
      createdBy: user._id,
      createdAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: id,
      kind: 'draft_created',
      actorId: user._id,
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_DRAFT_CREATED,
      targetId: id,
    });
    return id;
  },
});

/**
 * Saves the draft (the screen calls it automatically). A draft may be
 * incomplete; what is checked here is what is SAFE to store. The bounds that
 * make a text submittable are checked at submission.
 *
 * Editing a `returned` contribution after its text was sent creates the NEXT
 * version: a version already sent is never rewritten.
 */
export const saveDraft = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    title: v.string(),
    standfirst: v.string(),
    body: v.string(),
    lang: kohopLang,
    fields: v.array(v.string()),
    keywords: v.array(v.string()),
    coAuthors: v.array(coAuthorArg),
    links: v.array(linkArg),
    priorWorks: v.array(v.string()),
    originalityDeclaration: v.optional(v.string()),
  },
  returns: v.object({
    version: v.number(),
    wordCount: v.number(),
    savedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      args.contributionId,
    );
    if (!EDITABLE.includes(contribution.stage)) refuse('NOT_EDITABLE');
    await enforceRateLimit(ctx, {
      key: `kohop:save:${user._id}`,
      max: 240,
      windowMs: HOUR,
    });
    const clean = await cleanFields(ctx, args);
    const declaration = args.originalityDeclaration?.trim() || undefined;
    if (
      declaration &&
      declaration.length > KOHOP_BOUNDS.originalityDeclaration.max
    ) {
      refuse('INVALID_PRIOR_WORKS');
    }

    const now = Date.now();
    const wordCount = countWords(clean.body);
    const frozen =
      contribution.submittedVersion === contribution.currentVersion;
    let version = contribution.currentVersion;
    const row = {
      title: clean.title,
      standfirst: clean.standfirst,
      body: clean.body,
      links: clean.links,
      wordCount,
    };
    if (frozen) {
      version += 1;
      await ctx.db.insert('kohopVersions', {
        contributionId: contribution._id,
        version,
        kind: 'submission',
        ...row,
        createdBy: user._id,
        createdAt: now,
      });
    } else {
      const current = await versionOf(ctx, contribution._id, version);
      if (!current) refuse('NOT_FOUND');
      await ctx.db.patch(current._id, row);
    }
    await ctx.db.patch(contribution._id, {
      title: clean.title,
      lang: clean.lang,
      fields: clean.fields,
      keywords: clean.keywords,
      coAuthors: clean.coAuthors,
      priorWorks: clean.priorWorks,
      originalityDeclaration: declaration,
      currentVersion: version,
      updatedAt: now,
    });
    return { version, wordCount, savedAt: now };
  },
});

// --- Reading my files ---------------------------------------------------------

// What the AUTHOR sees of a reviewer: never the e-mail, the flags, the link
// findings nor the declared relationship.
async function reviewersForAuthor(
  ctx: QueryCtx,
  contributionId: Id<'kohopContributions'>,
) {
  const rows = await ctx.db
    .query('kohopReviewers')
    .withIndex('by_contribution', (q) => q.eq('contributionId', contributionId))
    .take(30);
  return rows
    .filter((r) => r.status !== 'recused' || r.source !== 'external')
    .map((r) => ({
      _id: r._id,
      slot: r.slot,
      source: r.source,
      name: r.name,
      affiliation: r.affiliation ?? null,
      status: r.status,
      dueAt: r.dueAt ?? null,
    }));
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const rows = await ctx.db
      .query('kohopContributions')
      .withIndex('by_author', (q) => q.eq('authorUserId', user._id))
      .order('desc')
      .take(100);
    return rows.map((c) => ({
      _id: c._id,
      title: c.title,
      stage: c.stage,
      lang: c.lang,
      updatedAt: c.updatedAt,
      submittedAt: c.submittedAt ?? null,
      revisionDueAt: c.revisionDueAt ?? null,
      proofDueAt: c.proofDueAt ?? null,
      returnedDueAt: c.returnedDueAt ?? null,
      slug: c.slug ?? null,
    }));
  },
});

export const getMine = query({
  args: { contributionId: v.id('kohopContributions') },
  handler: async (ctx, { contributionId }) => {
    // Someone else's file, or none: `null` — the screen shows "not found"
    // instead of an error page, and nothing says which of the two it is.
    const user = await requireNetworkRole(ctx, 'membre');
    const contribution = await ctx.db.get(contributionId);
    if (!contribution || contribution.authorUserId !== user._id) return null;
    const version = await versionOf(
      ctx,
      contributionId,
      contribution.currentVersion,
    );
    const events = await ctx.db
      .query('kohopEvents')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .order('desc')
      .take(50);
    const decisions = await ctx.db
      .query('kohopDecisions')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .order('desc')
      .take(10);
    const authorActions: KohopEvent[] = eventsFor(contribution.stage, 'author');
    return {
      _id: contribution._id,
      stage: contribution.stage,
      lang: contribution.lang,
      title: contribution.title,
      fields: contribution.fields,
      keywords: contribution.keywords,
      coAuthors: contribution.coAuthors,
      priorWorks: contribution.priorWorks,
      originalityDeclaration: contribution.originalityDeclaration ?? '',
      originalityDeclaredAt: contribution.originalityDeclaredAt ?? null,
      charterAcceptedAt: contribution.charterAcceptedAt ?? null,
      licence: contribution.licence,
      slug: contribution.slug ?? null,
      currentVersion: contribution.currentVersion,
      submittedVersion: contribution.submittedVersion ?? null,
      submittedAt: contribution.submittedAt ?? null,
      revisionDueAt: contribution.revisionDueAt ?? null,
      proofDueAt: contribution.proofDueAt ?? null,
      returnedDueAt: contribution.returnedDueAt ?? null,
      version: version
        ? {
            version: version.version,
            standfirst: version.standfirst,
            body: version.body,
            links: version.links,
            wordCount: version.wordCount,
          }
        : null,
      reviewers: await reviewersForAuthor(ctx, contributionId),
      // The history, WITHOUT actor identities (the author knows who acts).
      events: events.map((e) => ({ kind: e.kind, at: e.at })),
      // What the review chief told the author when sending the file back.
      lastDecision: decisions[0]
        ? {
            kind: decisions[0].kind,
            reasonCode: decisions[0].reasonCode ?? null,
            reason: decisions[0].reason,
            at: decisions[0].createdAt,
          }
        : null,
      authorActions,
      editable: EDITABLE.includes(contribution.stage),
      charterVersion: KOHOP_CHARTER_VERSION,
    };
  },
});

// --- Choosing the reviewers ---------------------------------------------------

/**
 * Candidates from the MEMBERS' DIRECTORY: accounts of rank `membre` or above,
 * with a listed profile, that did not ask not to be proposed. Nothing about
 * links is shown here: the author learns of a refusal only when designating.
 */
export const searchReviewers = query({
  args: {
    contributionId: v.id('kohopContributions'),
    query: v.optional(v.string()),
  },
  handler: async (ctx, { contributionId, query: text }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    const term = normalizeSearchTerm(text);
    const rows = term
      ? await ctx.db
          .query('memberProfiles')
          .withSearchIndex('search_text', (q) =>
            q.search('searchText', term).eq('listed', true),
          )
          .take(40)
      : await ctx.db
          .query('memberProfiles')
          .withIndex('by_listed_and_nameKey', (q) => q.eq('listed', true))
          .take(40);

    const already = new Set(
      (
        await ctx.db
          .query('kohopReviewers')
          .withIndex('by_contribution', (q) =>
            q.eq('contributionId', contribution._id),
          )
          .take(30)
      )
        .filter((r) => KOHOP_ACTIVE_REVIEWER_STATUSES.includes(r.status))
        .map((r) => r.userId),
    );

    const out = [];
    for (const p of rows) {
      if (out.length >= 20) break;
      if (p.userId === user._id || p.notReviewer === true) continue;
      if (already.has(p.userId)) continue;
      const account = await ctx.db.get(p.userId);
      if (
        !account ||
        account.suspendedAt !== undefined ||
        (account.role !== 'membre' &&
          account.role !== 'moderateur' &&
          account.role !== 'editeur' &&
          account.role !== 'admin')
      ) {
        continue;
      }
      out.push({
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
        jobTitle: p.jobTitle ?? null,
        country: p.country ?? null,
        themes: p.themes,
        languages: p.languages,
        organization:
          (await displayedOrganization(ctx, p.userId))?.name ?? null,
      });
    }
    return out;
  },
});

/**
 * Designates a reviewer from the directory. The server computes the links: a
 * BLOCKING link refuses the designation (`REVIEWER_NOT_ELIGIBLE`, generic for
 * the author); the detail is stored in `kohopLinkChecks` for the review chief.
 */
export const proposeReviewer = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    userId: v.id('users'),
    slot: v.union(v.literal('titular'), v.literal('substitute')),
    declaredRelationship: v.string(),
  },
  returns: v.id('kohopReviewers'),
  handler: async (ctx, args) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      args.contributionId,
    );
    if (
      !EDITABLE.includes(contribution.stage) &&
      !REPLACEMENT_STAGES.includes(contribution.stage)
    ) {
      refuse('NOT_EDITABLE');
    }
    if (!isDeclaredRelationship(args.declaredRelationship))
      refuse('INVALID_RELATIONSHIP');
    await enforceRateLimit(ctx, {
      key: `kohop:designate:${user._id}`,
      max: 30,
      windowMs: HOUR,
    });

    const profile = await ctx.db
      .query('memberProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    const account = await ctx.db.get(args.userId);
    // Same refusal whatever the reason (unknown account, private profile, opted
    // out, suspended): nothing about who exists or who opted out.
    if (
      !account ||
      !profile ||
      !profile.listed ||
      profile.notReviewer === true ||
      account.suspendedAt !== undefined ||
      (account.role !== 'membre' &&
        account.role !== 'moderateur' &&
        account.role !== 'editeur' &&
        account.role !== 'admin')
    ) {
      refuse('REVIEWER_NOT_ELIGIBLE');
    }

    const existing = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contribution._id),
      )
      .take(30);
    const active = existing.filter((r) =>
      KOHOP_ACTIVE_REVIEWER_STATUSES.includes(r.status),
    );
    if (active.some((r) => r.userId === args.userId))
      refuse('REVIEWER_ALREADY_PROPOSED');
    const limit =
      args.slot === 'titular'
        ? KOHOP_BOUNDS.reviewers.titular
        : KOHOP_BOUNDS.reviewers.substitute;
    if (active.filter((r) => r.slot === args.slot).length >= limit)
      refuse('SLOT_FULL');

    const facts = await collectLinkFacts(ctx, {
      contribution,
      candidate: {
        userId: args.userId,
        email: account.email,
        name: profile.displayName,
      },
      declaredRelationship: args.declaredRelationship,
    });
    const findings = evaluateLinks(facts);
    const level = linkLevel(facts);
    const now = Date.now();

    // The check is recorded even when it refuses? A refused designation must
    // leave no reviewer row; the detail goes to the review chief through the
    // link check, tied to the contribution (no reviewer to point at), so a
    // blocked candidate is kept in the history instead.
    if (level === 'blocking') {
      await recordKohopEvent(ctx, {
        contributionId: contribution._id,
        kind: 'link_checked',
        actorId: user._id,
        metadata: {
          candidateUserId: args.userId,
          level,
          findings: findings.map((f) => ({
            type: f.type,
            detail: f.detail,
            source: f.source ?? null,
          })),
        },
      });
      refuse('REVIEWER_NOT_ELIGIBLE');
    }

    const reviewerId = await ctx.db.insert('kohopReviewers', {
      contributionId: contribution._id,
      slot: args.slot,
      source: 'directory',
      name: profile.displayName,
      email: account.email ? normalizeEmail(account.email) : undefined,
      affiliation:
        (await displayedOrganization(ctx, args.userId))?.name ?? undefined,
      declaredRelationship: args.declaredRelationship,
      userId: args.userId,
      status: 'proposed',
      flags: findings.map((f) => f.type),
      remindersSent: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('kohopLinkChecks', {
      contributionId: contribution._id,
      reviewerId,
      level,
      findings: findings.map((f) => ({
        type: f.type,
        detail: f.detail,
        source: f.source,
      })),
      origin: 'rules',
      checkedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'reviewer_proposed',
      actorId: user._id,
      metadata: { reviewerId, slot: args.slot },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_REVIEWER_PROPOSED,
      targetId: contribution._id,
      metadata: { reviewerId, slot: args.slot, level },
    });
    return reviewerId;
  },
});

export const removeReviewer = mutation({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.null(),
  handler: async (ctx, { reviewerId }) => {
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) refuse('NOT_FOUND');
    const { user, contribution } = await requireOwnContribution(
      ctx,
      reviewer.contributionId,
    );
    if (
      !EDITABLE.includes(contribution.stage) &&
      !REPLACEMENT_STAGES.includes(contribution.stage)
    ) {
      refuse('NOT_EDITABLE');
    }
    // Only a designation that nobody acted upon can be taken back.
    if (reviewer.status !== 'proposed') refuse('INVALID_TRANSITION');

    const checks = await ctx.db
      .query('kohopLinkChecks')
      .withIndex('by_reviewer', (q) => q.eq('reviewerId', reviewerId))
      .take(20);
    for (const check of checks) await ctx.db.delete(check._id);
    await ctx.db.delete(reviewerId);
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'reviewer_recused',
      actorId: user._id,
      metadata: { reviewerId, by: 'author' },
    });
    return null;
  },
});

// --- Submission ---------------------------------------------------------------

/**
 * Sends the file to the review chief. Checked here, whatever the screen says:
 * the bounds of the text, the engagements (charter, publication agreement,
 * originality declaration), and two designated titular reviewers.
 */
export const submit = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    acceptCharter: v.boolean(),
    acceptAgreement: v.boolean(),
    declareOriginality: v.boolean(),
  },
  returns: v.object({ stage: v.literal('submitted') }),
  handler: async (ctx, args) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      args.contributionId,
    );
    await assertCanDeposit(ctx, user._id);
    // The machine first: a stage that does not accept `submit` writes nothing.
    const to = advance(contribution.stage, 'submit');
    await enforceRateLimit(ctx, {
      key: `kohop:submit:${user._id}`,
      max: 10,
      windowMs: HOUR,
    });

    const B = KOHOP_BOUNDS;
    const version = await versionOf(
      ctx,
      contribution._id,
      contribution.currentVersion,
    );
    if (!version) refuse('NOT_FOUND');
    if (
      version.title.length < B.title.min ||
      version.title.length > B.title.max
    )
      refuse('INVALID_TITLE');
    if (
      version.standfirst.length < B.standfirst.min ||
      version.standfirst.length > B.standfirst.max
    )
      refuse('INVALID_STANDFIRST');
    if (
      contribution.fields.length < B.fields.min ||
      contribution.fields.length > B.fields.max
    )
      refuse('INVALID_FIELDS');
    const problem = validateBody(version.body, B.words);
    if (problem) {
      refuse(
        problem.code === 'unsupported'
          ? 'BODY_UNSUPPORTED'
          : problem.code === 'too_short'
            ? 'BODY_TOO_SHORT'
            : 'BODY_TOO_LONG',
      );
    }
    if (
      !args.acceptCharter ||
      !args.acceptAgreement ||
      !args.declareOriginality
    )
      refuse('COMMITMENTS_REQUIRED');

    const reviewers = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contribution._id),
      )
      .take(30);
    const titulars = reviewers.filter(
      (r) =>
        r.slot === 'titular' &&
        KOHOP_ACTIVE_REVIEWER_STATUSES.includes(r.status),
    );
    if (titulars.length < B.reviewers.titular) refuse('REVIEWERS_INCOMPLETE');

    const now = Date.now();
    await ctx.db.patch(contribution._id, {
      stage: to,
      submittedVersion: contribution.currentVersion,
      submittedAt: contribution.submittedAt ?? now,
      returnedDueAt: undefined,
      charterVersion: KOHOP_CHARTER_VERSION,
      charterAcceptedAt: now,
      originalityDeclaredAt: now,
      organizationId:
        contribution.organizationId ??
        (await organizationOfAuthor(ctx, user._id)) ??
        undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'submit',
      actorId: user._id,
      metadata: { version: contribution.currentVersion },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_SUBMITTED,
      targetId: contribution._id,
      metadata: {
        version: contribution.currentVersion,
        words: version.wordCount,
        charterVersion: KOHOP_CHARTER_VERSION,
      },
    });

    // The review chiefs and the administrators: in the bell, and by e-mail.
    for (const chief of await reviewChiefRecipients(ctx)) {
      await notify(ctx, {
        userId: chief._id,
        type: 'kohop_submitted',
        titleKey: 'kohopSubmitted',
        params: { title: version.title },
        link: `/admin/kohop/${contribution._id}`,
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.kohopEmail.alertChiefsOfSubmission,
      { contributionId: contribution._id },
    );
    return { stage: 'submitted' as const };
  },
});

/** The author withdraws their contribution before publication. */
export const withdraw = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    const to = advance(contribution.stage, 'withdraw');
    const now = Date.now();
    await ctx.db.patch(contribution._id, {
      stage: to,
      returnedDueAt: undefined,
      revisionDueAt: undefined,
      proofDueAt: undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId,
      kind: 'withdraw',
      actorId: user._id,
      metadata: { from: contribution.stage },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_WITHDRAWN,
      targetId: contributionId,
      metadata: { from: contribution.stage },
    });
    return null;
  },
});
