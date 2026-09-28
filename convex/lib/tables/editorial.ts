import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import { reportContentFields, reportStatus } from '../annualReports';
import { blindStatus, manuscriptDecision } from '../manuscripts';

// Tables of the "editorial" workstream: annual reports (F-41) and versions /
// decisions of the peer review (F-43). The review tables that existed before
// this workstream (`peerReviews`, `peerReviewAssignments`) have stayed in
// convex/schema.ts, extended in place.
export const editorialTables = {
  // ANNUAL REPORT — one row per EDITION (year). Metadata lives here; the text,
  // per language, in `annualReportContents`: the admin screen only edits one
  // language at a time, and the public page only reads one. `origin` says
  // whether the edition was copied from the hard-coded content (migration) or
  // created in the admin.
  annualReports: defineTable({
    year: v.number(),
    status: reportStatus,
    inaugural: v.boolean(),
    origin: v.union(v.literal('coded'), v.literal('admin')),
    createdBy: v.optional(v.id('users')),
    updatedBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index('by_year', ['year'])
    // Public list: published editions, by year.
    .index('by_status_and_year', ['status', 'year']),

  // Text of an edition in ONE language. `contentHash` is the hash of that text
  // (convex/lib/annualReports.ts): the PDF is only served if it was composed
  // from that very hash.
  annualReportContents: defineTable({
    reportId: v.id('annualReports'),
    locale,
    ...reportContentFields,
    contentHash: v.string(),
    updatedAt: v.number(),
  })
    .index('by_report_and_locale', ['reportId', 'locale'])
    .index('by_report', ['reportId']),

  // Composed PDF of an edition in one language — separate from the text: it is
  // rewritten on every regeneration, and the public page only reads it for the
  // download button.
  annualReportPdfs: defineTable({
    reportId: v.id('annualReports'),
    locale,
    storageId: v.id('_storage'),
    size: v.number(),
    pages: v.number(),
    contentHash: v.string(),
    generatedAt: v.number(),
  })
    .index('by_report_and_locale', ['reportId', 'locale'])
    .index('by_report', ['reportId']),

  // MANUSCRIPT VERSION (F-43) — version 1 is the initial submission, each
  // revision adds one. Nothing is rewritten: the reviewer evaluates a NAMED
  // version, and the history shows what changed between two.
  //
  // `fileId` is the author's file, as submitted (editor only).
  // `blindFileId` is its ANONYMISED copy (author metadata removed) — the only
  // one a reviewer sees. `blindStatus` says where that copy stands.
  manuscriptVersions: defineTable({
    publicationId: v.id('publications'),
    version: v.number(),
    title: v.string(),
    abstract: v.string(),
    keywords: v.array(v.string()),
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
    blindFileId: v.optional(v.id('_storage')),
    blindStatus,
    /** Fields removed from the file by anonymisation (Author, XMP…). */
    strippedFields: v.optional(v.array(v.string())),
    /** Response letter to reviewers — mandatory from v2 onwards. */
    responseLetter: v.optional(v.string()),
    submittedBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_publication_and_version', ['publicationId', 'version'])
    .index('by_submitter', ['submittedBy']),

  // REASONED EDITORIAL DECISION — one row per decision, never rewritten.
  // The author receives the reason; the editor who made it is not shown to the
  // author (they do not need it, and the committee speaks with one voice).
  manuscriptDecisions: defineTable({
    publicationId: v.id('publications'),
    version: v.number(),
    decision: manuscriptDecision,
    reason: v.string(),
    decidedBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_publication', ['publicationId']),
};
