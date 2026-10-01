import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, mutation, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  requireNetworkRole,
  getCurrentUser,
  getActiveUserId,
  rank,
} from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { aiModerationApplied, aiModerationVerdict } from './lib/aiModeration';
import {
  enforceRateLimit,
  consumePublicationViewQuota,
  RATE_LIMITS,
} from './lib/rateLimit';
import { trackPublicationStatus } from './lib/counters';
import { organizationOfAuthor } from './lib/orgMembership';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { normalizeSearchTerm } from './lib/search';
import { publicationSearchText } from './lib/searchText';
import { onPublicationPublished } from './translationJobs';
import {
  matchesPublication,
  sortPublications,
  computePublicationFacets,
  slugify,
  PUB_SORTS,
  PUB_TYPES,
  PUB_THEMES,
  PUB_REGIONS,
  PUB_LANGS,
  PUB_ACCESS,
  projectPublication,
  isPublicationLocked,
  publicPublicationValidator,
  publicationFacetsValidator,
  type PubSort,
} from './lib/publications';

// Does the reader have "member" rights (validated membership)? Used for gating
// `access: 'members'` publications (F-35). An authenticated account WITHOUT validated
// membership counts as "visitor" and therefore stays locked.
async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

// Total views of a publication (F-37). Sum of the two DISJOINT
// sources: `publications.views` (legacy — views counted before the counter
// was isolated, demo values set by devAdmin) and the
// `publicationViews` row (everything counted since). No view lost, none
// counted twice: nothing writes `publications.views` in production anymore.
async function totalViews(ctx: QueryCtx, pub: Doc<'publications'>) {
  const row = await ctx.db
    .query('publicationViews')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .unique();
  return (pub.views ?? 0) + (row?.count ?? 0);
}

// Public library (F-32/F-33): filtered list + facets computed over
// all *published* publications (so as to offer only useful
// filters). Server-side rendering, filters in the URL -> SEO + low bandwidth
// (F-05/F-07). No draft/pending publication is ever exposed here.
const sortValidator = v.optional(
  v.union(...PUB_SORTS.map((s) => v.literal(s))),
);

// Vocabulary validators (neutral slugs) — reused by the member submission.
const typeValidator = v.union(...PUB_TYPES.map((t) => v.literal(t)));
const themeValidator = v.union(...PUB_THEMES.map((t) => v.literal(t)));
const regionValidator = v.union(...PUB_REGIONS.map((r) => v.literal(r)));
const langValidator = v.union(...PUB_LANGS.map((l) => v.literal(l)));
const accessValidator = v.union(...PUB_ACCESS.map((a) => v.literal(a)));

export const listPublished = query({
  args: {
    themes: v.optional(v.array(v.string())),
    types: v.optional(v.array(v.string())),
    regions: v.optional(v.array(v.string())),
    langs: v.optional(v.array(v.string())),
    access: v.optional(v.array(v.string())),
    q: v.optional(v.string()),
    sort: sortValidator,
  },
  // RETURN validator: describes what goes out, and nothing else can go out.
  // Convex FAILS the query if the handler returns an undeclared field — the
  // leak becomes a visible failure rather than data served silently.
  returns: v.object({
    items: v.array(publicPublicationValidator),
    facets: publicationFacetsValidator,
    total: v.number(),
  }),
  handler: async (ctx, { sort, ...filters }) => {
    const published = await ctx.db
      .query('publications')
      .withIndex('by_status', (qi) => qi.eq('status', 'published'))
      .collect();
    const isMember = await viewerIsMember(ctx);
    const items = sortPublications(
      published.filter((p) => matchesPublication(p, filters)),
      (sort as PubSort) ?? 'recent',
    ).map((p) => projectPublication(p, null, isMember));
    return {
      items,
      // The facets count ALL published ones, restricted ones included: the
      // gating hides the content, not the existence (discoverability, F-35).
      facets: computePublicationFacets(published, filters),
      total: published.length,
    };
  },
});

// Publication detail (F-34) — public: returns ONLY published
// publications. Status filtering lives in the query (and not in the caller)
// so that no consumer can expose a draft / a submission.
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(publicPublicationValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;
    // "Members only" gating (F-35). The signed URL is not even
    // GENERATED when the publication is locked: nothing to leak.
    const isMember = await viewerIsMember(ctx);
    const locked = isPublicationLocked(pub.access, isMember);
    const fileUrl =
      !locked && pub.fileId ? await ctx.storage.getUrl(pub.fileId) : null;
    // The view count (F-37) comes from the aggregated row, not from the
    // document: this is the only query that displays it, hence the only one to pay
    // for this extra read.
    return projectPublication(
      pub,
      fileUrl,
      isMember,
      await totalViews(ctx, pub),
    );
  },
});

// View counter (F-37) — PUBLIC mutation, without authentication.
// No-op if the publication does not exist or is not published (we neither expose nor
// count drafts / submissions). Per-session deduplication lives on the
// client side (sessionStorage).
//
// TWO FIXES (issue #8):
//
//  1. CAP. Unauthenticated public endpoint, with no quota at all: the counter
//     could be inflated with a `for` loop. The quota is set on (address block,
//     publication) — the only unforgeable key here (see lib/rateLimit.ts).
//     Exceeding the quota is NOT an error surfaced to the page: the
//     view is simply not counted. The quota is consumed BEFORE
//     reading the publication, so that hammering unknown slugs is not
//     free either.
//
//  2. CONTENTION. The increment patched the publication document — the one
//     read by the library, the detail and the "même thématique" block.
//     Each visit therefore invalidated all these subscriptions, and the most
//     read publication was in write contention with itself (OCC). The
//     count now lives in a dedicated row, read only by
//     `getBySlug`.
export const recordPublicationView = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug }) => {
    if (!(await consumePublicationViewQuota(ctx, slug))) return null;

    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;

    const row = await ctx.db
      .query('publicationViews')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { count: row.count + 1 });
    } else {
      await ctx.db.insert('publicationViews', {
        publicationId: pub._id,
        count: 1,
      });
    }
    return null;
  },
});

// Download / consultation counter — PUBLIC mutation, called on
// clicking "Télécharger le PDF" or "Consulter (DOI)" on the record page.
//
// Measured on 27/09 (member A-8): NO mutation wrote `downloads` — the
// displayed "Télécharg." counter was only the value set by the seed, and
// never moved. Same guard as views: quota per (address block,
// publication), exceeding = not counted and not reported; no-op on a
// missing or unpublished publication. The count stays on the document
// (`downloads`, read by the list and the record page): a click is a rare event
// — nothing like a view — and it is this field that the
// "most downloaded" sort and the cards display.
export const recordPublicationDownload = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug }) => {
    if (!(await consumePublicationViewQuota(ctx, `dl:${slug}`))) return null;

    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;

    await ctx.db.patch(pub._id, { downloads: pub.downloads + 1 });
    return null;
  },
});

// Related publications (same theme) — for the "Dans la même
// thématique" block of the detail. Excludes the current publication, bounded by `limit`.
export const relatedByTheme = query({
  args: {
    // NO narrowing here: `publications.theme` is `v.string()` in the schema
    // (seed publications carry themes outside the vocabulary), and
    // the caller passes the theme of an existing publication. A union would make
    // the "dans la même thématique" block fail on those publications.
    theme: v.string(),
    excludeSlug: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicPublicationValidator),
  handler: async (ctx, { theme, excludeSlug, limit }) => {
    const sameTheme = await ctx.db
      .query('publications')
      .withIndex('by_status_and_theme', (q) =>
        q.eq('status', 'published').eq('theme', theme),
      )
      .collect();
    const isMember = await viewerIsMember(ctx);
    return sortPublications(
      sameTheme.filter((p) => p.slug !== excludeSlug),
      'recent',
    )
      .slice(0, limit ?? 3)
      .map((p) => projectPublication(p, null, isMember));
  },
});

// --- Document submission (F-32): member -> moderator workflow ---------------

// Single-use upload URL for the document (PDF, dataset…).
// Authenticated: only a signed-in member can obtain an upload URL.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    await enforceRateLimit(ctx, {
      key: `upload:${user._id}`,
      ...RATE_LIMITS.upload,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

const authorValidator = v.object({
  name: v.string(),
  role: v.optional(v.string()),
});

// Server-side bounds of the uploaded file (mirrors the client's MAX_FILE_MB=20). We
// NEVER trust the content-type announced at upload: we re-read the
// REAL metadata of the blob (ctx.db.system) at submission time.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['application/pdf'];

// Submission of a publication by a member (F-32). Creates a record in
// 'pending' status — never exposed publicly until a moderator has
// published it. Validated server-side (defense in depth, the UI validates too).
// Audited.
export const submitPublication = mutation({
  args: {
    title: v.string(),
    type: typeValidator,
    theme: themeValidator,
    region: regionValidator,
    languages: v.array(langValidator),
    access: accessValidator,
    year: v.number(),
    authors: v.array(authorValidator),
    abstract: v.string(),
    keypoints: v.optional(v.array(v.string())),
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Reserved for validated members (membership model B) — a visitor must
    // first get their membership application validated.
    const user = await requireNetworkRole(ctx, 'membre');

    const title = args.title.trim();
    const abstract = args.abstract.trim();
    const authors = args.authors
      .map((a) => ({ name: a.name.trim(), role: a.role?.trim() || undefined }))
      .filter((a) => a.name.length >= 2);
    const languages = [...new Set(args.languages)];
    const keypoints = (args.keypoints ?? [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 8);

    const nowYear = new Date(Date.now()).getUTCFullYear();
    if (title.length < 4 || title.length > 200)
      throw new Error('INVALID_TITLE');
    if (abstract.length < 20 || abstract.length > 4000)
      throw new Error('INVALID_ABSTRACT');
    if (authors.length === 0) throw new Error('INVALID_AUTHORS');
    if (languages.length === 0) throw new Error('INVALID_LANGUAGES');
    if (
      !Number.isInteger(args.year) ||
      args.year < 1990 ||
      args.year > nowYear + 1
    )
      throw new Error('INVALID_YEAR');

    await enforceRateLimit(ctx, {
      key: `pub:${user._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });

    // Server-side validation of the uploaded blob (defense in depth): we re-read
    // the REAL storage metadata, never the content-type announced by the
    // client. The SIZE is always bounded (DoS / cost vector). The TYPE is only
    // rejected if it is set and outside the allow-list (Convex does not always
    // guarantee it; after-the-fact moderation covers the case where it is missing).
    // NB: no ctx.storage.delete here — the throw rolls back the transaction
    // (rollback), so the deletion would have no effect. A rejected blob stays
    // orphaned (never referenced by a publication nor served); cleaning up
    // orphans belongs to a separate job.
    if (args.fileId) {
      const meta = await ctx.db.system.get(args.fileId);
      const typeRejected = meta?.contentType
        ? !ALLOWED_FILE_TYPES.includes(meta.contentType)
        : false;
      // An EMPTY file is not a document: once accepted, it became a
      // publication whose "PDF" weighs 0 bytes (measured on 27/09).
      if (
        !meta ||
        meta.size === 0 ||
        meta.size > MAX_FILE_BYTES ||
        typeRejected
      ) {
        throw new Error('INVALID_FILE');
      }
    }

    // Unique slug (incremental suffix in case of title collision).
    const root = slugify(title);
    let slug = root;
    let n = 2;
    while (
      await ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .first()
    ) {
      slug = `${root}-${n++}`;
    }

    // Submitter's organization (F-21): the organization's public profile
    // lists what its accounts publish.
    const organizationId = await organizationOfAuthor(ctx, user._id);

    const now = Date.now();
    const id = await ctx.db.insert('publications', {
      title,
      slug,
      type: args.type,
      theme: args.theme,
      region: args.region,
      languages,
      access: args.access,
      authors,
      year: args.year,
      publishedAt: 0, // set at publication
      abstract,
      keypoints,
      body: [],
      doi: '', // internal DOI assigned at publication
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId: user._id,
      submittedAt: now,
      createdAt: now,
      ...(args.fileId ? { fileId: args.fileId } : {}),
      ...(args.fileName ? { fileName: args.fileName.slice(0, 200) } : {}),
      // Global search (diffusion workstream): haystack maintained on write.
      // A `pending` submission is indexed but NEVER served — the search pins
      // `status: 'published'` in the index read.
      searchText: publicationSearchText({
        title,
        authors,
        abstract,
        keypoints,
      }),
      searchLang: languages[0],
      ...(organizationId ? { organizationId } : {}),
    });

    await trackPublicationStatus(ctx, null, 'pending');

    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.PUBLICATION_SUBMITTED,
      targetId: id,
      metadata: { type: args.type, theme: args.theme },
    });

    // AI-assisted moderation (convex/aiModeration.ts) — SCHEDULED, never
    // called here. Three reasons, in this order:
    //
    //  1. a Convex mutation has no `fetch`: the model call can only
    //     live in an action;
    //  2. the submitting member need not wait for the ruling. Their submission
    //     is secured on insert, whatever happens next;
    //  3. if the analysis fails, the submission simply stays `pending` — the state
    //     in which this mutation just wrote it. Failure of the mechanism
    //     therefore falls back to the behavior before the mechanism, never to a
    //     publication.
    //
    // Reading the mode here is not a security guard (`runReview`
    // re-checks it): it simply avoids scheduling an action we already know
    // will have nothing to do.
    const aiConfig = await ctx.db
      .query('aiModerationConfig')
      .withIndex('by_key', (q) => q.eq('key', 'default'))
      .unique();
    if (aiConfig && aiConfig.mode !== 'off') {
      await ctx.scheduler.runAfter(0, internal.aiModeration.runReview, {
        publicationId: id,
      });
    }

    return { id, slug };
  },
});

// My contributions (F-32) — the signed-in user sees THEIR submissions, all
// statuses combined (draft / under review / published), most recent first.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
    if (!userId) return [];
    const mine = await ctx.db
      .query('publications')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .collect();
    return mine
      .sort(
        (a, b) =>
          (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt),
      )
      .map((p) => ({
        _id: p._id,
        title: p.title,
        slug: p.slug,
        type: p.type,
        status: p.status,
        submittedAt: p.submittedAt ?? p.createdAt,
        reviewNotes: p.reviewNotes ?? null,
      }));
  },
});

// Publication moderation queue (F-32 / F-26) — moderator and above.
// Returns pending submissions (or all), with the author's email and
// the URL of the uploaded document for review.
//
// PAGINATED (issue #8). The queue loaded the ENTIRE `publications` table in
// "all" mode, then resolved the author one row at a time — one
// round-trip per publication, and one signed URL per file. The order now comes
// from the index (most recent first) instead of an in-memory sort:
// that is what makes the cursor possible.
const reviewItemValidator = v.object({
  _id: v.id('publications'),
  title: v.string(),
  slug: v.string(),
  type: typeValidator,
  theme: v.string(),
  region: regionValidator,
  languages: v.array(langValidator),
  access: accessValidator,
  year: v.number(),
  abstract: v.string(),
  authors: v.array(authorValidator),
  status: v.union(
    v.literal('draft'),
    v.literal('pending'),
    v.literal('published'),
  ),
  submittedAt: v.number(),
  // Date of the last decision. A `draft` carrying one is a REJECTION,
  // not a never-submitted draft (issue #32): this is what decides whether
  // the screen offers "Rouvrir" (issue #9).
  reviewedAt: v.union(v.number(), v.null()),
  reviewNotes: v.union(v.string(), v.null()),
  authorEmail: v.union(v.string(), v.null()),
  fileName: v.union(v.string(), v.null()),
  fileUrl: v.union(v.string(), v.null()),
  // AI review — SUMMARY only (verdict, decision, number of signals). The
  // detail (findings, quoted excerpts) is read via `aiModeration.getReview`, on
  // the row a moderator opens: loading it for a hundred rows would make the
  // queue heavier than what it displays.
  aiReview: v.union(
    v.object({
      verdict: aiModerationVerdict,
      applied: aiModerationApplied,
      reason: v.string(),
      confidence: v.number(),
      blocking: v.number(),
      warnings: v.number(),
      at: v.number(),
    }),
    v.null(),
  ),
  // Put online WITHOUT human review: the queue says so, and that is what
  // enables "remettre en file".
  autoPublished: v.boolean(),
});

// SEARCHABLE (issue #49): the title, via a full-text index, with the status
// carried by `filterFields` — the "pending" queue thus remains a single
// index read when searching it. Filtering the displayed page client-side
// would only have searched the 25 rows already there, never the queue.
export const listForReview = query({
  args: {
    status: v.optional(v.union(v.literal('pending'), v.literal('all'))),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedValidator(reviewItemValidator),
  handler: async (ctx, { status, search, paginationOpts }) => {
    const viewer = await requireNetworkRole(ctx, 'moderateur');
    // DOUBLE BLIND (F-43, editorial workstream): a moderator may be the
    // REVIEWER of a manuscript present in this queue. For a publication
    // engaged in a peer review, the author's identity — names,
    // address, original file (its metadata often names them) — is only
    // returned to the editor, who drives the review.
    const seesAuthors = rank(viewer.role) >= rank('editeur');
    const opts = clampPageSize(paginationOpts);
    const term = normalizeSearchTerm(search);
    const result = term
      ? await ctx.db
          .query('publications')
          .withSearchIndex('search_title', (q) => {
            const q2 = q.search('title', term);
            return status === 'all' ? q2 : q2.eq('status', 'pending');
          })
          .paginate(opts)
      : status === 'all'
        ? await ctx.db.query('publications').order('desc').paginate(opts)
        : await ctx.db
            .query('publications')
            .withIndex('by_status', (q) => q.eq('status', 'pending'))
            .order('desc')
            .paginate(opts);

    // The same member often submits several publications: we deduplicate the
    // page's authors before reading them, once each.
    const authors = await loadAuthors(
      ctx,
      result.page.map((p) => p.authorUserId),
    );

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (p) => {
          const blind = p.reviewStage !== undefined && !seesAuthors;
          return {
            _id: p._id,
            title: p.title,
            slug: p.slug,
            type: p.type,
            theme: p.theme,
            region: p.region,
            languages: p.languages,
            access: p.access,
            year: p.year,
            abstract: p.abstract,
            authors: blind ? [] : p.authors,
            status: p.status,
            submittedAt: p.submittedAt ?? p.createdAt,
            // A `draft` WITH `reviewedAt` is a rejection, not a never-submitted
            // draft (issue #32): this is what renders the "Rouvrir" button.
            reviewedAt: p.reviewedAt ?? null,
            reviewNotes: p.reviewNotes ?? null,
            authorEmail: blind
              ? null
              : ((p.authorUserId ? authors.get(p.authorUserId)?.email : null) ??
                null),
            fileName: blind ? null : (p.fileName ?? null),
            fileUrl:
              !blind && p.fileId ? await ctx.storage.getUrl(p.fileId) : null,
            aiReview: p.aiReview ?? null,
            autoPublished: p.autoPublished === true,
          };
        }),
      ),
    };
  },
});

// --- Moderation state machine (audit M6 · issue #9) --------------------------
//
//   draft ─────────────────────────────────────────► (dead end)
//   pending ──approved─► published        pending ──rejected─► rejected
//   rejected ──reopenPublicationReview──► pending
//   published ─────────────────────────────────────► (dead end here)
//
// Three points settled:
//
//  1. a `draft` is NOT approved. A never-submitted draft was proposed
//     to no one; approving it would publish a text its author did not put
//     up for review.
//  2. a decision is neither replayed nor reversed. "Rejeter" after having
//     approved would silently unpublish, on a mere second click, a document
//     already online and already indexed.
//  3. WITHDRAWING an online publication is not a review replay:
//     it is a removal from the catalog, which awaits the `archived` state of issue
//     #32. Until it exists, `published` is a dead end here.
//
// `rejected` is not (yet) a status in the schema — that is the subject of issue
// #32 — so a rejection falls back to `draft`. We reconstruct the real state with
// `reviewedAt`: without it, a never-submitted draft and a pronounced rejection
// would be the same state, and the guard of point 1 would fall.
type PublicationReviewState = Doc<'publications'>['status'] | 'rejected';

const PUBLICATION_REVIEW: ReviewMachine<PublicationReviewState> = {
  transitions: {
    draft: [],
    pending: ['published', 'rejected'],
    rejected: ['pending'],
    published: [],
  },
  decided: ['published', 'rejected'],
};

function reviewState(pub: Doc<'publications'>): PublicationReviewState {
  return pub.status === 'draft' && pub.reviewedAt !== undefined
    ? 'rejected'
    : pub.status;
}

// Reads a page's authors, deduplicating the ids.
async function loadAuthors(
  ctx: QueryCtx,
  ids: (Id<'users'> | undefined)[],
): Promise<Map<Id<'users'>, Doc<'users'>>> {
  const unique = [
    ...new Set(ids.filter((id): id is Id<'users'> => id !== undefined)),
  ];
  const out = new Map<Id<'users'>, Doc<'users'>>();
  await Promise.all(
    unique.map(async (id) => {
      const user = await ctx.db.get(id);
      if (user) out.set(id, user);
    }),
  );
  return out;
}

// Moderation decision (F-32) — moderator and above, audited. Only accepts
// a SUBMITTED publication (`pending`), see the machine above.
//  - approved: the publication becomes public (status 'published'; date and
//    internal DOI assigned if missing);
//  - rejected: back to draft, with a note for the author.
export const reviewPublication = mutation({
  args: {
    publicationId: v.id('publications'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { publicationId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    assertTransition(
      reviewState(pub),
      decision === 'approved' ? 'published' : 'rejected',
      PUBLICATION_REVIEW,
    );

    const now = Date.now();
    const reviewNotes = notes?.trim() || undefined;
    if (decision === 'approved') {
      await ctx.db.patch(publicationId, {
        status: 'published',
        publishedAt: pub.publishedAt || now,
        doi: pub.doi || `10.59000/dt.${pub.slug}`,
        reviewedBy: reviewer._id,
        reviewedAt: now,
        reviewNotes,
      });
      // Translated into the other site languages as soon as it is public,
      // its PDF included.
      await onPublicationPublished(ctx, publicationId);
    } else {
      // Lacking a `rejected` status (issue #32), a rejection falls back to `draft`;
      // it is `reviewedAt` that distinguishes it from a never-submitted draft.
      await ctx.db.patch(publicationId, {
        status: 'draft',
        reviewedBy: reviewer._id,
        reviewedAt: now,
        reviewNotes,
      });
    }

    await trackPublicationStatus(
      ctx,
      pub.status,
      decision === 'approved' ? 'published' : 'draft',
    );

    // Notifies the submission's author of the moderation outcome (F-25/F-51).
    if (pub.authorUserId) {
      await notify(ctx, {
        userId: pub.authorUserId,
        type:
          decision === 'approved'
            ? 'publication_published'
            : 'publication_rejected',
        titleKey: decision === 'approved' ? 'pubPublished' : 'pubRejected',
        params: { title: pub.title },
        link:
          decision === 'approved'
            ? `/bibliotheque/${pub.slug}`
            : '/espace-membre',
      });
    }

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PUBLICATION_REVIEWED,
      targetId: publicationId,
      metadata: { decision },
    });
  },
});

// Reopening a rejection (issue #9) — moderator and above, audited.
//
// This is THE backward transition of moderation, and it has a name: a rejection
// pronounced by mistake goes back into the queue (`pending`) under its own audit
// action (`publication.reopened`), instead of being erased by a second click
// on "Approuver" which, for its part, would leave no trace of the hesitation.
//
// Reopens ONLY what was rejected: a never-submitted draft (no
// `reviewedAt`) stays out of the queue — INVALID_TRANSITION — otherwise the guard
// "a never-submitted publication cannot be approved" would be bypassed
// in two clicks. An ONLINE publication is not reopened either:
// unpublishing it is a withdrawal, which awaits the `archived` state of issue #32.
//
// The fields of the previous decision (`reviewNotes`, `reviewedBy`,
// `reviewedAt`) are KEPT: they say why the rejection had been
// pronounced, and the next decision will replace them.
export const reopenPublicationReview = mutation({
  args: { publicationId: v.id('publications') },
  handler: async (ctx, { publicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    const from = reviewState(pub);
    assertTransition(from, 'pending', PUBLICATION_REVIEW);

    await ctx.db.patch(publicationId, { status: 'pending' });
    // The publication returns to the queue: the dashboard counter counts it
    // again (issue #8). Without this call, "pending" would undercount
    // every reopened case.
    await trackPublicationStatus(ctx, pub.status, 'pending');
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PUBLICATION_REOPENED,
      targetId: publicationId,
      metadata: { from },
    });
    return { ok: true };
  },
});

// Requeueing a publication put online by the AI (moderator+, audited).
//
// WHY THIS EXIT EXISTS, even though `published` is a dead end.
//
// The machine above closes `published` for a precise reason: unpublishing
// a document already online and already indexed is a CATALOG WITHDRAWAL, which
// awaits the `archived` state of issue #32 — not the side effect of a second
// click on a review button.
//
// An automatic publication is not that case. Nobody has read it: the
// first human look does not REVERSE a decision, it is the decision —
// the one the mechanism anticipated. Refusing this return would make
// the model's ruling more final than a moderator's, whose
// rejections, for their part, can be reopened (`reopenPublicationReview`).
//
// The door is therefore narrow, and three keys hold it together:
//   - `autoPublished === true` — a document validated by a human, even
//     approved after an AI review, does not enter here;
//   - `status === 'published'` — we only "requeue" what is
//     online;
//   - the flag is REMOVED on the way: the exit only works once, and
//     the decision that follows will be human, hence final in the
//     machine's sense.
//
// Audited under its own action (`publication.ai_reverted`): the log must
// be able to show the complete sequence — published by the AI, withdrawn by a
// human, then decided — without the three being confused.
export const revertAutoPublication = mutation({
  args: { publicationId: v.id('publications') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { publicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    if (pub.autoPublished !== true || pub.status !== 'published') {
      throw new Error('INVALID_TRANSITION');
    }

    await ctx.db.patch(publicationId, {
      status: 'pending',
      autoPublished: false,
      // `reviewedAt` set by the AI is ERASED: leaving it would make a
      // `pending` read as an already decided case — exactly the confusion that
      // `reviewState` must avoid on rejected drafts.
      reviewedAt: undefined,
    });
    await trackPublicationStatus(ctx, 'published', 'pending');

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PUBLICATION_AI_REVERTED,
      targetId: publicationId,
      metadata: {
        reason: pub.aiReview?.reason ?? null,
        confidence: pub.aiReview?.confidence ?? null,
      },
    });
    return { ok: true };
  },
});
