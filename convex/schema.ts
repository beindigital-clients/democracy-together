import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import { documentBlock, documentStatus, extractedImage } from './lib/documents';
import {
  translatableFields,
  translationSourceType,
  translationStatus,
} from './lib/translation';
import {
  aiModerationMode,
  aiModerationSeverity,
  aiModerationVerdict,
  aiModerationApplied,
} from './lib/aiModeration';
import { socialTables } from './lib/tables/social';
import { paiementsTables } from './lib/tables/paiements';
import {
  contentStatusValidator,
  storedWorkspaceRoleValidator,
  workspaceVisibilityValidator,
} from './lib/communaute';
import { communauteTables } from './lib/tables/communaute';
import { contenusTables } from './lib/tables/contenus';
import { comptesTables } from './lib/tables/comptes';
import { programmesTables } from './lib/tables/programmes';

// Network roles (F-02) — ascending hierarchy, see convex/lib/rbac.ts.
export const networkRole = v.union(
  v.literal('visiteur'),
  v.literal('membre'),
  v.literal('moderateur'),
  v.literal('editeur'),
  v.literal('admin'),
);

// The language validator lives in `./lib/locales` (import cycle: the
// `contentTranslations` table pulls in `./lib/translation`, which needs it too). It
// stays re-exported here: a dozen modules import it from `./schema`.
import { locale } from './lib/locales';
import { manuscriptStage } from './lib/manuscripts';
import { editorialTables } from './lib/tables/editorial';
export { locale, SITE_LOCALES, type SiteLocale } from './lib/locales';
import { diffusionTables } from './lib/tables/diffusion';

export default defineSchema({
  // Convex Auth tables (users, authSessions, authAccounts, ...).
  ...authTables,

  // Convex Auth owns `users`; we redefine it to add role + language.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // --- Democracy Together ---
    role: v.optional(networkRole),
    preferredLocale: v.optional(locale),
    // Suspension (accounts workstream, F-63). Set on the account itself and not
    // in a separate table: ALL the guards in convex/lib/rbac.ts
    // read it, and they already read this document — checking it costs no
    // extra read. The reason is mandatory on suspension.
    suspendedAt: v.optional(v.number()),
    suspensionReason: v.optional(v.string()),
    suspendedBy: v.optional(v.id('users')),
  })
    .index('email', ['email'])
    // `by_role` serves the bootstrap's "zero admin" guard (convex/bootstrap.ts):
    // it must answer with a single document read, without scanning the table.
    .index('by_role', ['role'])
    // Back-office search (issue #49) — FULL-TEXT INDEX, not an in-memory
    // filter. The `users` table is the screen that will grow fastest, and
    // #8 just removed its `.collect()`: searching by reloading the whole
    // list to filter it client-side would bring it right back. The address
    // is the back-office's identification key (the name is optional, and
    // often missing from an invited account). `filterFields` carries the role
    // filter IN the same index read — without it, filtering a search
    // would require re-reading then sorting outside the index.
    .searchIndex('search_email', {
      searchField: 'email',
      filterFields: ['role'],
    }),

  // Member think tanks (F-19 directory, F-21 member profile).
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    country: v.string(),
    region: v.string(),
    languages: v.array(v.string()),
    themes: v.array(v.string()),
    description: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    status: v.union(
      v.literal('active'),
      v.literal('pending'),
      v.literal('suspended'),
    ),
    createdAt: v.number(),
    // FOLDED search haystack (F-06, diffusion workstream) — name, description,
    // country spelled out, without accents. Maintained on write
    // (`organizationSearchText`), filled for existing data by
    // `searchIndexing.backfill`. Optional: a document that does not carry it
    // is simply not found by the global search.
    searchText: v.optional(v.string()),
    // Member profile (F-21, accounts workstream): logo in Convex storage
    // (content verified before being accepted) and the organization's choice to
    // show, or not, its members on its public page.
    logoFileId: v.optional(v.id('_storage')),
    showMembers: v.optional(v.boolean()),
    updatedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_region', ['region'])
    // Global search: `status` as a filter so that only active profiles
    // come out, IN the index read (not after).
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['status', 'region'],
    }),

  // User <-> organization link (delegation, F-21).
  organizationMemberships: defineTable({
    userId: v.id('users'),
    orgId: v.id('organizations'),
    orgRole: v.union(
      v.literal('owner'),
      v.literal('editor'),
      v.literal('member'),
    ),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_org', ['orgId'])
    .index('by_org_user', ['orgId', 'userId']),

  // Library (F-32/F-33/F-34) — network publications. Moderated UGC: a
  // member submits (status 'pending'), a moderator publishes (status 'published').
  // Public queries return ONLY published publications. The
  // vocabulary (type/theme/region) uses neutral slugs (see lib/publications).
  publications: defineTable({
    title: v.string(),
    slug: v.string(),
    type: v.union(
      v.literal('rapport'),
      v.literal('policy-brief'),
      v.literal('working-paper'),
      v.literal('note'),
      v.literal('dataset'),
    ),
    theme: v.string(),
    region: v.union(
      v.literal('afrique'),
      v.literal('europe'),
      v.literal('mondial'),
    ),
    languages: v.array(locale),
    access: v.union(v.literal('open'), v.literal('members')),
    authors: v.array(
      v.object({ name: v.string(), role: v.optional(v.string()) }),
    ),
    year: v.number(),
    publishedAt: v.number(),
    abstract: v.string(),
    keypoints: v.array(v.string()),
    body: v.array(v.string()),
    pages: v.optional(v.number()),
    license: v.optional(v.string()),
    doi: v.string(),
    // Cover thumbnail — public path (seed); optional for
    // member submissions (F-32), which upload a document, not an image.
    image: v.optional(v.string()),
    downloads: v.number(),
    citations: v.number(),
    views: v.optional(v.number()),
    status: v.union(
      v.literal('draft'),
      v.literal('pending'),
      v.literal('published'),
    ),
    // Moderation (member -> moderator workflow, like F-22/F-26).
    authorUserId: v.optional(v.id('users')),
    submittedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    // Peer review (F-43) — layer ON TOP of moderation.
    // Stage of the manuscript state machine (convex/lib/manuscripts.ts):
    // submitted → in_review → revision → resubmitted → accepted / rejected.
    // `reviewed` is the legacy stage from the first version ("avis rendu").
    reviewStage: v.optional(manuscriptStage),
    // AI-assisted moderation — DENORMALIZED SUMMARY of the latest review
    // (convex/aiModeration.ts). The full review — signals, quoted excerpts,
    // model, tokens — lives in `aiModerationReviews`: the moderation queue
    // shows a badge per row without re-reading a hundred reviews, and only loads the detail
    // for the row a moderator opens.
    aiReview: v.optional(
      v.object({
        verdict: aiModerationVerdict,
        applied: aiModerationApplied,
        reason: v.string(),
        confidence: v.number(),
        blocking: v.number(),
        warnings: v.number(),
        at: v.number(),
      }),
    ),
    // Published WITHOUT human review. The flag is not cosmetic: it is
    // the condition for `revertAutoPublication` to exist — the only way
    // back out of `published`, and it must only open on what a human
    // has never validated.
    autoPublished: v.optional(v.boolean()),
    // Uploaded document (F-32): file in Convex storage + original name.
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
    // Submitter's organization (F-21, accounts workstream): set on submission when
    // the account is linked to an organization. This is what lets the
    // public profile list ITS publications.
    organizationId: v.optional(v.id('organizations')),
    createdAt: v.number(),
    // Full-text search (F-06/F-34, diffusion workstream): FOLDED haystack
    // (title, authors, abstract, key points) and main language — an array
    // (`languages`) cannot serve as an equality filter in a search
    // index. Maintained on write, filled by `searchIndexing.backfill`.
    searchText: v.optional(v.string()),
    searchLang: v.optional(locale),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_status_and_theme', ['status', 'theme'])
    .index('by_author', ['authorUserId'])
    .index('by_organization_and_status', ['organizationId', 'status'])
    // Review queue (F-43, convex/peerReview.ts): `reviewStage` is only set
    // on publications ENGAGED in a review — a tiny minority of the
    // table. The index isolates them without reading the others. Documents where the field
    // is missing are indexed under `undefined`, which precedes any value: the
    // whole queue is therefore obtained by the `> undefined` range, in one
    // contiguous read (see getReviewQueue).
    .index('by_reviewStage', ['reviewStage'])
    // Moderation queue search (issue #49): the title. `status` in
    // `filterFields` so that "pending" and the search fit in a
    // single read, as `by_status` already does without search.
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['status'],
    })
    // PUBLIC search (palette, /recherche). `status` there is ALWAYS pinned to
    // 'published' by the query: a draft cannot come out, whatever the
    // term. The other filters are those of the results page.
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['status', 'type', 'theme', 'region', 'searchLang', 'year'],
    }),

  // Views per publication (F-37) — counter ISOLATED from the document.
  //
  // The count used to be patched onto the publication itself: each visit
  // rewrote a document read by the entire library (list, detail,
  // "même thématique"), hence invalidated all those subscriptions and put the
  // most viewed page in write contention with itself (OCC).
  // A dedicated row, tiny and read nowhere else, absorbs the traffic
  // without touching the document.
  //
  // MIGRATION: `publications.views` keeps the views counted BEFORE this
  // split (and the demo values set by devAdmin). The displayed total
  // is the SUM of both — the sources are disjoint, nothing
  // writes `publications.views` in production anymore.
  publicationViews: defineTable({
    publicationId: v.id('publications'),
    count: v.number(),
  }).index('by_publication', ['publicationId']),

  // Peer review (F-43) — reviewers' reviews (moderator+) on a
  // publication. Layer on top of moderation: an editor assigns a
  // reviewer (reviewStage='in_review'), the reviewers submit a review, then
  // the editor decides (revision / reviewed). `reviewerName` = denormalized
  // snapshot (avoids a join when reading the queue).
  peerReviews: defineTable({
    publicationId: v.id('publications'),
    reviewerUserId: v.id('users'),
    reviewerName: v.string(),
    recommendation: v.union(
      v.literal('accept'),
      v.literal('minor'),
      v.literal('major'),
      v.literal('reject'),
    ),
    comment: v.string(),
    // Evaluated manuscript version (F-43, editorial workstream). Missing on
    // reviews predating versions: they refer to version 1.
    version: v.optional(v.number()),
    // CONFIDENTIAL comment to the editor — never shown to the author.
    commentToEditor: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_publication', ['publicationId'])
    .index('by_reviewer', ['reviewerUserId'])
    // Application-level uniqueness of the review (issue #9): ONE review per reviewer and per
    // publication. The index makes the `peerReview.submitReview` guard exact
    // without re-reading the whole list of reviews.
    .index('by_publication_and_reviewer', ['publicationId', 'reviewerUserId']),

  // Review assignments (27/09 campaign, R-01 / A-02). `assignReviewer`
  // only NOTIFIED: nothing recorded who had been assigned to what.
  // Yet the full queue (`getReviewQueue`) is reserved for the editor, whereas
  // the reviewer is often a moderator: once notified, they had no screen
  // showing them "what they were entrusted with". This table is what the
  // "Mes relectures" view reads — via the `by_reviewer` index, without scanning
  // publications. One row per (publication, reviewer); reassigning on a
  // reopened review updates the row instead of creating a second one.
  peerReviewAssignments: defineTable({
    publicationId: v.id('publications'),
    reviewerUserId: v.id('users'),
    assignedBy: v.id('users'),
    assignedAt: v.number(),
    // --- Editorial workstream (F-43): rounds, deadlines, conflicts of interest ---
    // Version this reviewer evaluates in the current round.
    version: v.optional(v.number()),
    // Review deadline. Set while the review is EXPECTED, cleared when it
    // is submitted, when the reviewer recuses themselves or when the review closes: the
    // `by_dueAt` index therefore only contains overdue reviews, and the
    // reminder task reads them without scanning closed assignments.
    dueAt: v.optional(v.number()),
    remindersSent: v.optional(v.number()),
    lastReminderAt: v.optional(v.number()),
    // The editor was notified of the delay after the last reminder.
    overdueNotifiedAt: v.optional(v.number()),
    // Conflict-of-interest declaration, prerequisite to accessing the manuscript.
    conflict: v.optional(
      v.object({
        hasConflict: v.boolean(),
        details: v.optional(v.string()),
        declaredAt: v.number(),
      }),
    ),
  })
    .index('by_reviewer', ['reviewerUserId'])
    .index('by_publication', ['publicationId'])
    .index('by_publication_and_reviewer', ['publicationId', 'reviewerUserId'])
    .index('by_dueAt', ['dueAt']),

  // Membership applications (F-22) — validation workflow by a moderator.
  membershipApplications: defineTable({
    type: v.union(v.literal('organisation'), v.literal('individu')),
    applicantUserId: v.optional(v.id('users')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
    // APPLICANT'S LANGUAGE, recorded when the form is submitted. The five other
    // public forms (newsletter, event registration, reminder,
    // youth application, mentoring) already stored it; this one was the only
    // one not to — and it is the only one whose approval triggers an
    // email. Without it, an Arabic-speaking applicant received their membership
    // approval in French, with a link to a French page.
    locale: v.optional(locale),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewNotes: v.optional(v.string()),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    // Onboarding (F-01/F-22): timestamp of the invitation email sent to the
    // approved applicant, and organization created on approval. Allows
    // resending the invitation without duplicating the account or the directory profile.
    invitedAt: v.optional(v.number()),
    createdOrgId: v.optional(v.id('organizations')),
  })
    .index('by_status', ['status'])
    .index('by_applicant', ['applicantUserId'])
    // Applications queue search (issue #49): the
    // organization's name — that is how an application is found.
    .searchIndex('search_organizationName', {
      searchField: 'organizationName',
      filterFields: ['status'],
    }),

  // Newsletter subscriptions (F-18). In-house newsletter: sending orchestrated by
  // Convex via the email adapter (Resend, then AWS SES). `unsubToken` = unsubscribe
  // link in each send.
  //
  // DOUBLE OPT-IN (diffusion workstream): a subscription is born `pending` and
  // receives NOTHING until the confirmation link has been followed. The confirmation
  // token is only stored HASHED (SHA-256): a leak of the table does not
  // allow confirming anyone. Missing `status` = LEGACY subscriber, predating
  // double opt-in — they do not receive campaigns until
  // `newsletter.migrateLegacySubscribers` has asked them for confirmation
  // (see docs/backlog/diffusion.md).
  newsletterSubscriptions: defineTable({
    email: v.string(),
    locale: v.optional(locale),
    unsubToken: v.optional(v.string()),
    createdAt: v.number(),
    status: v.optional(v.union(v.literal('pending'), v.literal('confirmed'))),
    confirmTokenHash: v.optional(v.string()),
    confirmExpiresAt: v.optional(v.number()),
    // Number of confirmation emails sent — resending is BOUNDED.
    confirmSends: v.optional(v.number()),
    confirmLastSentAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    // PROOF OF CONSENT (GDPR art. 7.1): when, from which form,
    // in which language, and under which version of the information notice.
    consent: v.optional(
      v.object({
        at: v.number(),
        source: v.string(),
        locale: v.optional(locale),
        textVersion: v.string(),
      }),
    ),
  })
    .index('by_email', ['email'])
    .index('by_token', ['unsubToken'])
    .index('by_confirm_hash', ['confirmTokenHash'])
    // Campaign recipients (`confirmed`), purge of expired pending entries
    // (`pending` + deadline) and migration of legacy ones (`undefined`).
    .index('by_status_and_expiry', ['status', 'confirmExpiresAt']),

  // Newsletter campaigns (F-65) — composed in the back-office, sent to all
  // subscribers via the email adapter.
  //
  // BULK SENDING (diffusion workstream): the campaign is split into scheduled
  // batches, one status per recipient in `newsletterDeliveries`. The
  // counters below are the PROGRESS displayed live in the back-office
  // (`recipientCount` = sent, historical name kept).
  newsletterCampaigns: defineTable({
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('sending'),
      v.literal('sent'),
      v.literal('error'),
    ),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    recipientCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    // Language of the reference version (fallback for subscribers without a version in
    // their language). Missing = French, as before the workstream.
    locale: v.optional(locale),
    // Translated versions — five languages at most, hence a bounded array.
    variants: v.optional(
      v.array(v.object({ locale, subject: v.string(), body: v.string() })),
    ),
    // Recipients enqueued (grows during enqueueing).
    totalCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
    enqueueDone: v.optional(v.boolean()),
    startedAt: v.optional(v.number()),
    lastTestAt: v.optional(v.number()),
  }).index('by_status', ['status']),

  // Contact form (F-17).
  contactMessages: defineTable({
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    body: v.string(),
    handled: v.boolean(),
    createdAt: v.number(),
  }).index('by_handled', ['handled']),

  // Event registrations (F-53) — online RSVP. `eventSlug` = slug of the
  // event in `contentEvents` ("contenus" workstream): the server
  // validates it against the table before writing. Composite index (event, email):
  // serves deduplication AND the per-event count.
  eventRegistrations: defineTable({
    eventSlug: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    locale: v.optional(locale),
    createdAt: v.number(),
    // Sending of the video-conference link ("contenus" workstream): set when the
    // email has gone out, so it is never sent twice.
    visioSentAt: v.optional(v.number()),
  }).index('by_event_and_email', ['eventSlug', 'email']),

  // Event reminders by email (F-55) — a visitor (without an account) asks
  // to be notified before an upcoming event. `eventSlug` = slug of a
  // published event in `contentEvents`; `eventDate` = its start (`startsAt`),
  // COMPUTED SERVER-SIDE from the table. A daily cron sends the reminders
  // whose date is approaching (sendEmail NO-OP without a provider key). by_sent index
  // = queue of reminders to process; composite index (event, email) = deduplication.
  eventReminders: defineTable({
    eventSlug: v.string(),
    email: v.string(),
    locale: v.optional(locale),
    eventDate: v.number(),
    sent: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_sent', ['sent'])
    .index('by_event_and_email', ['eventSlug', 'email'])
    // UNSENT reminders for an address (pentest M-5): deduplication applies
    // to (slug, email), so varying the slug yielded a fresh slot and a
    // third-party address could be targeted repeatedly. The cap needs to
    // count, and counting needs this index.
    .index('by_email_and_sent', ['email', 'sent']),

  // Youth applications (F-58) — the Youth hub becomes functional. Application
  // without an account (like the F-22 membership, by email). Reviewed by staff.
  youthApplications: defineTable({
    name: v.string(),
    email: v.string(),
    country: v.string(),
    themes: v.optional(v.array(v.string())),
    motivation: v.string(),
    locale: v.optional(locale),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_email', ['email']),

  // Mentoring (F-59) — matching young people <-> network mentors. Request
  // without an account (by email, like F-58): one signs up as "mentoré"
  // (looking for a mentor) or "mentor" (offering their support). `themes` =
  // areas of interest (PUB_THEMES slugs). Reviewed by staff (matched / closed).
  mentorshipRequests: defineTable({
    name: v.string(),
    email: v.string(),
    country: v.string(),
    role: v.union(v.literal('mentore'), v.literal('mentor')),
    themes: v.optional(v.array(v.string())),
    message: v.string(),
    locale: v.optional(locale),
    status: v.union(
      v.literal('pending'),
      v.literal('matched'),
      v.literal('closed'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    // Decision note (27/09 campaign, A-08): it only existed in
    // the audit metadata, hence never on the mentoring screen.
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_email', ['email']),

  // Democratic Tribune (F-44/F-47/F-50) — moderated space for expression. Public
  // reading, writing reserved for members; PRE-moderation by default
  // (F-45), post-moderation if the administrator configures it, and reporting. `theme` = one of the 5 axes (PUB_THEMES slugs). `authorName` is a
  // denormalized snapshot (avoids a join when reading the feed).
  tribunePosts: defineTable({
    authorUserId: v.id('users'),
    authorName: v.string(),
    theme: v.string(),
    format: v.union(v.literal('court'), v.literal('fond')),
    title: v.string(),
    body: v.string(),
    // WRITING language of the post (issue #35). A Tribune post is
    // written in ONE language only and is never translated: both URL
    // prefixes serve the same text. Without this field, `tribune/[id]` could only
    // set one canonical per locale — two canonical pages for a single
    // piece of content, i.e. duplicate content. Filled in by the author on
    // publication; OPTIONAL because earlier posts do not carry it,
    // and the `resolveLocale` fallback (fr) is the right answer for
    // them.
    lang: v.optional(locale),
    // `pending` / `rejected`: PRE-moderation (F-45, community
    // workstream). A `pending` post is only served to its author and to
    // moderators; `rejected` carries the reason shown to the author.
    status: contentStatusValidator,
    commentCount: v.number(),
    createdAt: v.number(),
    // Global search (diffusion workstream): FOLDED haystack (title, author,
    // body) and publication year for the "date" filter.
    searchText: v.optional(v.string()),
    searchYear: v.optional(v.number()),
    // Last modification by the author (pending or rejected post).
    updatedAt: v.optional(v.number()),
    // Most recent human decision (the full history lives in
    // `moderationEvents`); `moderatedBy` missing + `autoPublished` = put
    // online by the AI, without review.
    moderatedBy: v.optional(v.id('users')),
    moderatedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    autoPublished: v.optional(v.boolean()),
    // Summary of the AI's latest review, for a badge in the queue.
    aiReview: v.optional(
      v.object({
        verdict: aiModerationVerdict,
        applied: aiModerationApplied,
        reason: v.string(),
        confidence: v.number(),
        blocking: v.number(),
        warnings: v.number(),
        at: v.number(),
      }),
    ),
    // IN-DEPTH PIECE (F-48): this long-form contribution extends a
    // short post.
    parentPostId: v.optional(v.id('tribunePosts')),
    // Proposed to the library: the publication (in the queue) that came out of it.
    libraryPublicationId: v.optional(v.id('publications')),
  })
    .index('by_status', ['status'])
    .index('by_status_and_theme', ['status', 'theme'])
    .index('by_author', ['authorUserId'])
    // Only `published` posts come out: filter set by the query.
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['status', 'theme', 'lang', 'searchYear'],
    })
    .index('by_parent_and_status', ['parentPostId', 'status']),

  tribuneComments: defineTable({
    postId: v.id('tribunePosts'),
    authorUserId: v.id('users'),
    authorName: v.string(),
    body: v.string(),
    status: contentStatusValidator,
    createdAt: v.number(),
    moderatedBy: v.optional(v.id('users')),
    moderatedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    autoPublished: v.optional(v.boolean()),
    aiReview: v.optional(
      v.object({
        verdict: aiModerationVerdict,
        applied: aiModerationApplied,
        reason: v.string(),
        confidence: v.number(),
        blocking: v.number(),
        warnings: v.number(),
        at: v.number(),
      }),
    ),
  })
    .index('by_post', ['postId'])
    // Moderation queue (pending comments, F-49) and "mes
    // commentaires" / account deletion.
    .index('by_status', ['status'])
    .index('by_author', ['authorUserId']),

  // Tribune reactions — a single type, "soutien" (like a like). One
  // reaction per member and per post: uniqueness via the composite index
  // (postId, userId). Counting happens at read time (no denormalization).
  tribuneReactions: defineTable({
    postId: v.id('tribunePosts'),
    userId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_post_and_user', ['postId', 'userId'])
    // Deletion / export of an account's data.
    .index('by_user', ['userId']),

  // Reports (F-50) — post-moderation queue. `targetId` = id of a
  // post or a comment (stored as a string, type carried by `targetType`).
  tribuneReports: defineTable({
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
    reason: v.optional(v.string()),
    reporterUserId: v.id('users'),
    resolved: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_resolved', ['resolved'])
    // History of a piece of content (F-49): its reports, without scanning the queue.
    .index('by_target', ['targetId'])
    .index('by_reporter', ['reporterUserId']),

  // Collaborative calls for projects (F-60) — proposals for projects carried out
  // jointly between members. The public page presents the SCHEME (no dated
  // call nor quantified funding); a member proposes a project (status
  // 'pending'), reviewed by staff (accepted / rejected). `theme` = one of the 5 axes
  // (PUB_THEMES slugs). `authorName` = denormalized snapshot (avoids a join).
  projectProposals: defineTable({
    authorUserId: v.id('users'),
    authorName: v.string(),
    theme: v.string(),
    title: v.string(),
    summary: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('rejected'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_author', ['authorUserId']),

  // Collaborative workspaces (F-24) — a network member opens a
  // space around a theme; other members join it and post
  // notes in it. Reading reserved for network members (member+); writing notes
  // is reserved for SPACE MEMBERS (workspaceMembers). `theme` = one of the 5
  // axes (PUB_THEMES slugs). `ownerName`/`memberCount` = denormalized snapshots
  // (avoid a join when reading the list).
  workspaces: defineTable({
    title: v.string(),
    theme: v.string(),
    description: v.string(),
    ownerUserId: v.id('users'),
    ownerName: v.string(),
    memberCount: v.number(),
    createdAt: v.number(),
    // Open (default, increment 1) or private by invitation.
    visibility: v.optional(workspaceVisibilityValidator),
    // Storage used by shared files (all versions), and
    // number of files — maintained on write, read for the quota.
    storageBytes: v.optional(v.number()),
    fileCount: v.optional(v.number()),
  }).index('by_owner', ['ownerUserId']),

  // Membership of a space (F-24). Uniqueness (space, user) via the composite
  // index by_workspace_and_user. `userName` = denormalized snapshot.
  workspaceMembers: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    userName: v.string(),
    // facilitator / contributor / reader; `owner` and `member` are the
    // legacy values (see effectiveWorkspaceRole, convex/lib/communaute.ts).
    role: storedWorkspaceRoleValidator,
    joinedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_and_user', ['workspaceId', 'userId'])
    // "Mes espaces": a user's memberships are read in ONE indexed
    // query. Without it, `listWorkspaces` resolved membership space by
    // space — one round-trip per displayed row (N+1).
    .index('by_user', ['userId']),

  // Notes of a space (F-24) — collaborative feed, writing reserved for members
  // of the space. `authorName` = denormalized snapshot.
  workspaceNotes: defineTable({
    workspaceId: v.id('workspaces'),
    authorUserId: v.id('users'),
    authorName: v.string(),
    body: v.string(),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_author', ['authorUserId']),

  // --- AI-assisted editorial moderation (auto-acceptance) -------------------
  //
  // Layer ON TOP of human moderation (convex/publications.ts), never
  // in its place: the model gives an OPINION, the server decides. See the
  // convex/lib/aiModeration.ts module for the decision logic, and
  // docs/moderation-ia.md for the framing.

  // Settings — SINGLETON (`key` is always 'default'). A single document
  // rather than one row per setting: these values are ALWAYS read together
  // (a decision consults them all), and are edited together from the same
  // screen. `version` increments on every write — settings AND rules — and
  // each review records it: a past review stays readable in light
  // of the rubric that produced it, and not of today's rubric.
  aiModerationConfig: defineTable({
    key: v.literal('default'),
    mode: aiModerationMode,
    model: v.string(),
    // Fallback model, tried ONCE if the first one fails (provider outage,
    // model removed from the catalog). Missing = no fallback.
    fallbackModel: v.optional(v.string()),
    // Minimum confidence (0..100) required for an automatic publication.
    autoPublishMinConfidence: v.number(),
    // Free-form editorial guidelines, at the top of the rubric. This is where
    // the administrator writes the house line; the criteria verifiable
    // one by one live in `aiModerationRules`.
    instructions: v.string(),
    // Publication types eligible for AUTO-PUBLICATION (PUB_TYPES slugs).
    // EMPTY list = no eligible type: an `auto` mode enabled without having
    // chosen a scope opens nothing until the administrator has said
    // on what. The analysis, however, covers all submissions.
    eligibleTypes: v.array(v.string()),
    // Attachments: the F-32 submission is a PDF. Without reading the PDF, the review only
    // covers the metadata — and an unread submission is NEVER
    // auto-published (see decideApplication).
    analyzeAttachments: v.boolean(),
    maxAttachmentMb: v.number(),
    // Cap on calls per 24 h (cost control). Exceeded -> the submission goes to the
    // human queue, it is not published blindly.
    dailyCallCap: v.number(),
    version: v.number(),
    updatedBy: v.optional(v.id('users')),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  // Acceptance criteria written by the administrator. Separate table, and not
  // an array in the settings document: the list is open (a growing
  // network adds criteria), and enabling a criterion must not
  // rewrite the whole rubric. The security BASELINE, however, is not here: it is
  // hard-coded (BASELINE_RULES) so that no screen can remove it.
  aiModerationRules: defineTable({
    label: v.string(),
    description: v.string(),
    severity: aiModerationSeverity,
    enabled: v.boolean(),
    order: v.number(),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_order', ['order']),

  // Reviews given — one per analysis, including analyses that applied
  // NOTHING (observation mode, call failure, human decision that arrived
  // first). This is the traceability record: without it, "why is this article
  // online without human review?" has no answer.
  aiModerationReviews: defineTable({
    publicationId: v.id('publications'),
    // What the MODEL concludes.
    verdict: aiModerationVerdict,
    // What the SERVER did with it. The two differ as soon as the mode, the
    // scope, the threshold or the current state stand in the way — and it is the second
    // that says what happened.
    applied: aiModerationApplied,
    // Reason for the application decision, as a stable code (see APPLY_REASONS):
    // displayed translated, and readable in the log without re-reading the rubric.
    reason: v.string(),
    confidence: v.number(),
    summary: v.string(),
    findings: v.array(
      v.object({
        // Criterion key: rule id, or `socle:<clé>` for the
        // security floor. A STRING and not a v.id: a deleted rule
        // must not make the review it produced unreadable.
        ruleKey: v.string(),
        ruleLabel: v.string(),
        severity: aiModerationSeverity,
        outcome: v.union(
          v.literal('pass'),
          v.literal('fail'),
          v.literal('unsure'),
        ),
        explanation: v.string(),
        // Excerpt quoted from the document. This is what makes a signal verifiable at
        // a glance, instead of having to re-read the whole submission.
        quote: v.optional(v.string()),
      }),
    ),
    // Call traceability.
    model: v.string(),
    configVersion: v.number(),
    attachmentAnalyzed: v.boolean(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    // Failure code (AI_GATEWAY_NOT_CONFIGURED, DAILY_CAP, BAD_RESPONSE…).
    error: v.optional(v.string()),
    triggeredBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_publication', ['publicationId'])
    .index('by_applied', ['applied']),

  // Per-user notifications (F-25/F-51) — reactive (Convex real time).
  // Triggered by existing moments (publication moderation, application
  // review). `titleKey` = i18n key (`notifications` namespace), `params`
  // interpolated client-side; `link` = optional internal path. Composite index
  // (user, read): serves the per-user list AND the unread count.
  // TRANSLATIONS OF CONTENT SUBMITTED BY MEMBERS (Tribune posts,
  // publications). One row per (content, reading language) pair.
  //
  // WHY A SEPARATE TABLE and not fields on `tribunePosts` /
  // `publications`. Five languages, two families of content: carrying the
  // translations on the source document would make it grow by five times its
  // text, whereas a page only EVER reads one. Yet these documents are read
  // everywhere — lists, facets, related records, moderation queue — and Convex
  // bills, as it invalidates, per whole document. This is the reasoning of
  // `publicationViews` (issue #8), applied to a text instead of a counter.
  //
  // `sourceId` is a STRING and not a `v.id`: the table covers two source
  // tables, and `sourceType` says which. The same pattern as
  // `tribuneReports.targetId`.
  //
  // `sourceHash` is the fingerprint of the text AT TRANSLATION TIME
  // (`sourceFingerprint`, convex/lib/translation.ts). It is re-read at
  // display time: if the author has corrected their text since, the translation describes
  // a version that no longer exists, and the page serves the original rather than
  // stale content without saying so.
  //
  // `status: 'failed'` IS KEPT, and this is not a cleanup oversight:
  // without a row, the interface could not distinguish "never requested" from
  // "requested, and the gateway did not respond". The first offers a
  // button, the second explains and offers to retry.
  contentTranslations: defineTable({
    sourceType: translationSourceType,
    sourceId: v.string(),
    sourceLocale: locale,
    targetLocale: locale,
    sourceHash: v.string(),
    status: translationStatus,
    // Missing as long as `status` is not 'ready'.
    fields: v.optional(translatableFields),
    model: v.optional(v.string()),
    // Gateway failure code (GATEWAY_ERRORS), displayed translated.
    error: v.optional(v.string()),
    requestedBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Reading a page: one piece of content, one language. This is the only access path.
    .index('by_source_and_target', ['sourceType', 'sourceId', 'targetLocale'])
    // Purge of a deleted content's translations (devAdmin), and display of the
    // languages already available under an article.
    .index('by_source', ['sourceType', 'sourceId']),

  // DOCUMENT EXTRACTED FROM A PDF — one row per publication.
  //
  // Extraction is done ONCE and serves all five languages: it re-reads the
  // PDF, which is the costly operation (the whole file goes to the model).
  // The translations, for their part, start from these blocks — JSON, a few tens
  // of kilobytes — and never need the file again.
  //
  // `fileId` is that of the PDF at extraction time. A member who
  // replaces their document changes `fileId`: the comparison is enough to know
  // that the extraction describes a file that is no longer attached, without a fingerprint to
  // compute over several megabytes.
  //
  // `images` holds the illustrations COPIED from the PDF into Convex storage
  // (convex/lib/pdfImages.ts). They are extracted only once, and the
  // five languages point to the same files: a figure is neither
  // recompressed nor duplicated per language.
  documentExtractions: defineTable({
    publicationId: v.id('publications'),
    fileId: v.id('_storage'),
    status: documentStatus,
    sourceLocale: locale,
    title: v.optional(v.string()),
    blocks: v.optional(v.array(documentBlock)),
    images: v.optional(v.array(extractedImage)),
    /** Images found in an encoding the extractor cannot read. */
    skippedImages: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_publication', ['publicationId']),

  // TRANSLATED VERSION OF A DOCUMENT — one row per (publication, language).
  //
  // Separate from the extraction for the same reason `contentTranslations` is
  // separate from the content: the document view only EVER reads one, and
  // carrying them all on the extraction row would make it be re-read in full for
  // each language. `extractionId` ties the translation to the version of the document
  // it comes from — if the PDF is replaced, a new extraction is born
  // and the old translations stop being served.
  documentRenditions: defineTable({
    publicationId: v.id('publications'),
    extractionId: v.id('documentExtractions'),
    sourceLocale: locale,
    targetLocale: locale,
    status: documentStatus,
    title: v.optional(v.string()),
    blocks: v.optional(v.array(documentBlock)),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_publication_and_locale', ['publicationId', 'targetLocale'])
    // Purge of versions attached to a replaced extraction.
    .index('by_extraction', ['extractionId']),

  notifications: defineTable({
    userId: v.id('users'),
    type: v.string(),
    titleKey: v.string(),
    params: v.optional(v.any()),
    link: v.optional(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
  }).index('by_user_and_read', ['userId', 'read']),

  // Audit log of sensitive actions (F-67; defense in depth).
  auditLog: defineTable({
    actorId: v.optional(v.id('users')),
    action: v.string(),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_action', ['action'])
    .index('by_actor', ['actorId'])
    // Log search (issue #49): the action. The full-text index splits
    // the dotted slug (`publication.reviewed` -> `publication`, `reviewed`), so
    // "publication" brings up the whole family and "reviewed" all the
    // decisions — which a prefix range on `by_action` cannot do.
    // `actorId` in `filterFields`: "everything this person has done"
    // remains a single index read, search included.
    .searchIndex('search_action', {
      searchField: 'action',
      filterFields: ['actorId'],
    }),

  // Denormalized back-office counters (F-61/F-66) — maintained ON WRITE.
  //
  // The dashboards counted by loading the tables (`collect().length`):
  // the cost of the administration screen grew with the network's success, and
  // Convex bills per data read. One row per counter, read in O(1) via
  // the `by_key` index, and incremented in the transaction that writes the counted
  // data — hence rolled back with it if it fails.
  //
  // The key registry lives in convex/lib/counters.ts; `counters.recompute`
  // (internalMutation) recomputes them from the tables — bootstrapping an
  // existing deployment, and reconciliation after a direct write.
  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),

  // Rate limiter (security, defense in depth) — per-key counter over a
  // fixed window. See convex/lib/rateLimit.ts.
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index('by_key', ['key']),

  // DEV/TEST only: plaintext OTP codes (emails are not sent
  // without a key). Never populated in prod (email key present -> real send).
  devOtpCodes: defineTable({
    email: v.string(),
    code: v.string(),
    purpose: v.string(),
    createdAt: v.number(),
  }).index('by_email', ['email']),

  ...socialTables,
  ...paiementsTables,
  ...diffusionTables,
  ...communauteTables,
  ...contenusTables,
  ...comptesTables,
  ...programmesTables,
  ...editorialTables,
});
