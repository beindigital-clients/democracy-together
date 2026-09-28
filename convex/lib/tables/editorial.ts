import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import { reportContentFields, reportStatus } from '../annualReports';
import { blindStatus, manuscriptDecision } from '../manuscripts';

// Tables du chantier « editorial » : rapports annuels (F-41) et versions /
// décisions de la revue à comité de lecture (F-43). Les tables de revue qui
// existaient avant ce chantier (`peerReviews`, `peerReviewAssignments`) sont
// restées dans convex/schema.ts, étendues en place.
export const editorialTables = {
  // RAPPORT ANNUEL — une ligne par ÉDITION (année). Les métadonnées vivent
  // ici ; le texte, par langue, dans `annualReportContents` : l'écran
  // d'administration n'édite qu'une langue à la fois, et la page publique n'en
  // lit qu'une. `origin` dit si l'édition a été recopiée du contenu codé
  // (migration) ou créée dans l'administration.
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
    // Liste publique : les éditions publiées, par année.
    .index('by_status_and_year', ['status', 'year']),

  // Texte d'une édition dans UNE langue. `contentHash` est l'empreinte de ce
  // texte (convex/lib/annualReports.ts) : le PDF n'est servi que s'il a été
  // composé à partir de cette empreinte-là.
  annualReportContents: defineTable({
    reportId: v.id('annualReports'),
    locale,
    ...reportContentFields,
    contentHash: v.string(),
    updatedAt: v.number(),
  })
    .index('by_report_and_locale', ['reportId', 'locale'])
    .index('by_report', ['reportId']),

  // PDF composé d'une édition dans une langue — séparé du texte : il est
  // réécrit à chaque régénération, et la page publique ne lit que lui pour le
  // bouton de téléchargement.
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

  // VERSION D'UN MANUSCRIT (F-43) — la version 1 est le dépôt initial, chaque
  // révision en ajoute une. Rien n'est réécrit : le relecteur évalue une
  // version NOMMÉE, et l'historique montre ce qui a changé entre deux.
  //
  // `fileId` est le fichier de l'auteur, tel que déposé (éditeur seulement).
  // `blindFileId` est sa copie ANONYMISÉE (métadonnées d'auteur retirées) —
  // la seule que voit un relecteur. `blindStatus` dit où en est cette copie.
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
    /** Champs retirés du fichier par l'anonymisation (Author, XMP…). */
    strippedFields: v.optional(v.array(v.string())),
    /** Lettre de réponse aux relecteurs — obligatoire à partir de la v2. */
    responseLetter: v.optional(v.string()),
    submittedBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_publication_and_version', ['publicationId', 'version'])
    .index('by_submitter', ['submittedBy']),

  // DÉCISION ÉDITORIALE MOTIVÉE — une ligne par décision, jamais réécrite.
  // L'auteur en reçoit le motif ; l'éditeur qui l'a prise n'est pas montré à
  // l'auteur (il n'en a pas besoin, et le comité parle d'une seule voix).
  manuscriptDecisions: defineTable({
    publicationId: v.id('publications'),
    version: v.number(),
    decision: manuscriptDecision,
    reason: v.string(),
    decidedBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_publication', ['publicationId']),
};
