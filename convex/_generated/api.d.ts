/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as aiModeration from "../aiModeration.js";
import type * as annualReports from "../annualReports.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as contact from "../contact.js";
import type * as counters from "../counters.js";
import type * as crons from "../crons.js";
import type * as devAdmin from "../devAdmin.js";
import type * as documents from "../documents.js";
import type * as editorial from "../editorial.js";
import type * as email from "../email.js";
import type * as eventReminders from "../eventReminders.js";
import type * as events from "../events.js";
import type * as experts from "../experts.js";
import type * as http from "../http.js";
import type * as impact from "../impact.js";
import type * as journal from "../journal.js";
import type * as lib_aiGateway from "../lib/aiGateway.js";
import type * as lib_aiModeration from "../lib/aiModeration.js";
import type * as lib_annualReports from "../lib/annualReports.js";
import type * as lib_annualReportsCoded from "../lib/annualReportsCoded.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auditActions from "../lib/auditActions.js";
import type * as lib_counters from "../lib/counters.js";
import type * as lib_directory from "../lib/directory.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_emailContent from "../lib/emailContent.js";
import type * as lib_locales from "../lib/locales.js";
import type * as lib_manuscripts from "../lib/manuscripts.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_onboarding from "../lib/onboarding.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_passwordPolicy from "../lib/passwordPolicy.js";
import type * as lib_pdfAnonymize from "../lib/pdfAnonymize.js";
import type * as lib_pdfImages from "../lib/pdfImages.js";
import type * as lib_publications from "../lib/publications.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_recaptcha from "../lib/recaptcha.js";
import type * as lib_reportPdf_fonts from "../lib/reportPdf/fonts.js";
import type * as lib_reportPdf_fonts_newsreader500 from "../lib/reportPdf/fonts/newsreader500.js";
import type * as lib_reportPdf_fonts_plexArabic400 from "../lib/reportPdf/fonts/plexArabic400.js";
import type * as lib_reportPdf_fonts_plexArabic600 from "../lib/reportPdf/fonts/plexArabic600.js";
import type * as lib_reportPdf_fonts_plexSans400 from "../lib/reportPdf/fonts/plexSans400.js";
import type * as lib_reportPdf_fonts_plexSans600 from "../lib/reportPdf/fonts/plexSans600.js";
import type * as lib_reportPdf_labels from "../lib/reportPdf/labels.js";
import type * as lib_reportPdf_layout from "../lib/reportPdf/layout.js";
import type * as lib_reportPdf_render from "../lib/reportPdf/render.js";
import type * as lib_reviewState from "../lib/reviewState.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_signIn from "../lib/signIn.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_tables_editorial from "../lib/tables/editorial.js";
import type * as lib_themes from "../lib/themes.js";
import type * as lib_translation from "../lib/translation.js";
import type * as lib_validation from "../lib/validation.js";
import type * as mentorship from "../mentorship.js";
import type * as newsletter from "../newsletter.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as otp from "../otp.js";
import type * as peerReview from "../peerReview.js";
import type * as peerReviewFiles from "../peerReviewFiles.js";
import type * as projects from "../projects.js";
import type * as publications from "../publications.js";
import type * as reportPdfNode from "../reportPdfNode.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as seedPublications from "../seedPublications.js";
import type * as translation from "../translation.js";
import type * as tribune from "../tribune.js";
import type * as users from "../users.js";
import type * as workspaces from "../workspaces.js";
import type * as youth from "../youth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiModeration: typeof aiModeration;
  annualReports: typeof annualReports;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  contact: typeof contact;
  counters: typeof counters;
  crons: typeof crons;
  devAdmin: typeof devAdmin;
  documents: typeof documents;
  editorial: typeof editorial;
  email: typeof email;
  eventReminders: typeof eventReminders;
  events: typeof events;
  experts: typeof experts;
  http: typeof http;
  impact: typeof impact;
  journal: typeof journal;
  "lib/aiGateway": typeof lib_aiGateway;
  "lib/aiModeration": typeof lib_aiModeration;
  "lib/annualReports": typeof lib_annualReports;
  "lib/annualReportsCoded": typeof lib_annualReportsCoded;
  "lib/audit": typeof lib_audit;
  "lib/auditActions": typeof lib_auditActions;
  "lib/counters": typeof lib_counters;
  "lib/directory": typeof lib_directory;
  "lib/documents": typeof lib_documents;
  "lib/emailContent": typeof lib_emailContent;
  "lib/locales": typeof lib_locales;
  "lib/manuscripts": typeof lib_manuscripts;
  "lib/notify": typeof lib_notify;
  "lib/onboarding": typeof lib_onboarding;
  "lib/pagination": typeof lib_pagination;
  "lib/passwordPolicy": typeof lib_passwordPolicy;
  "lib/pdfAnonymize": typeof lib_pdfAnonymize;
  "lib/pdfImages": typeof lib_pdfImages;
  "lib/publications": typeof lib_publications;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/rbac": typeof lib_rbac;
  "lib/recaptcha": typeof lib_recaptcha;
  "lib/reportPdf/fonts": typeof lib_reportPdf_fonts;
  "lib/reportPdf/fonts/newsreader500": typeof lib_reportPdf_fonts_newsreader500;
  "lib/reportPdf/fonts/plexArabic400": typeof lib_reportPdf_fonts_plexArabic400;
  "lib/reportPdf/fonts/plexArabic600": typeof lib_reportPdf_fonts_plexArabic600;
  "lib/reportPdf/fonts/plexSans400": typeof lib_reportPdf_fonts_plexSans400;
  "lib/reportPdf/fonts/plexSans600": typeof lib_reportPdf_fonts_plexSans600;
  "lib/reportPdf/labels": typeof lib_reportPdf_labels;
  "lib/reportPdf/layout": typeof lib_reportPdf_layout;
  "lib/reportPdf/render": typeof lib_reportPdf_render;
  "lib/reviewState": typeof lib_reviewState;
  "lib/roles": typeof lib_roles;
  "lib/search": typeof lib_search;
  "lib/signIn": typeof lib_signIn;
  "lib/slug": typeof lib_slug;
  "lib/tables/editorial": typeof lib_tables_editorial;
  "lib/themes": typeof lib_themes;
  "lib/translation": typeof lib_translation;
  "lib/validation": typeof lib_validation;
  mentorship: typeof mentorship;
  newsletter: typeof newsletter;
  notifications: typeof notifications;
  organizations: typeof organizations;
  otp: typeof otp;
  peerReview: typeof peerReview;
  peerReviewFiles: typeof peerReviewFiles;
  projects: typeof projects;
  publications: typeof publications;
  reportPdfNode: typeof reportPdfNode;
  search: typeof search;
  seed: typeof seed;
  seedPublications: typeof seedPublications;
  translation: typeof translation;
  tribune: typeof tribune;
  users: typeof users;
  workspaces: typeof workspaces;
  youth: typeof youth;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
