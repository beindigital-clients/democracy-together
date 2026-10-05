/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountNotices from "../accountNotices.js";
import type * as accounts from "../accounts.js";
import type * as admin from "../admin.js";
import type * as aiModeration from "../aiModeration.js";
import type * as annualReports from "../annualReports.js";
import type * as audience from "../audience.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as communaute from "../communaute.js";
import type * as communityModeration from "../communityModeration.js";
import type * as contact from "../contact.js";
import type * as contenus_devCleanup from "../contenus/devCleanup.js";
import type * as contenus_events from "../contenus/events.js";
import type * as contenus_media from "../contenus/media.js";
import type * as contenus_migration from "../contenus/migration.js";
import type * as contenus_news from "../contenus/news.js";
import type * as contenus_partners from "../contenus/partners.js";
import type * as contenus_press from "../contenus/press.js";
import type * as contenus_replays from "../contenus/replays.js";
import type * as contenus_themes from "../contenus/themes.js";
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
import type * as lib_accountAccess from "../lib/accountAccess.js";
import type * as lib_accountDeletion from "../lib/accountDeletion.js";
import type * as lib_accountEmails from "../lib/accountEmails.js";
import type * as lib_aiGateway from "../lib/aiGateway.js";
import type * as lib_aiModeration from "../lib/aiModeration.js";
import type * as lib_annualReports from "../lib/annualReports.js";
import type * as lib_annualReportsCoded from "../lib/annualReportsCoded.js";
import type * as lib_audience from "../lib/audience.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auditActions from "../lib/auditActions.js";
import type * as lib_communaute from "../lib/communaute.js";
import type * as lib_contenus_access from "../lib/contenus/access.js";
import type * as lib_contenus_coded_events from "../lib/contenus/coded/events.js";
import type * as lib_contenus_coded_news from "../lib/contenus/coded/news.js";
import type * as lib_contenus_coded_partners from "../lib/contenus/coded/partners.js";
import type * as lib_contenus_coded_themes from "../lib/contenus/coded/themes.js";
import type * as lib_contenus_events from "../lib/contenus/events.js";
import type * as lib_contenus_fixtures from "../lib/contenus/fixtures.js";
import type * as lib_contenus_i18n from "../lib/contenus/i18n.js";
import type * as lib_contenus_media from "../lib/contenus/media.js";
import type * as lib_contenus_time from "../lib/contenus/time.js";
import type * as lib_contenus_userData from "../lib/contenus/userData.js";
import type * as lib_contenus_validate from "../lib/contenus/validate.js";
import type * as lib_counters from "../lib/counters.js";
import type * as lib_directory from "../lib/directory.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_emailContent from "../lib/emailContent.js";
import type * as lib_emailLayout from "../lib/emailLayout.js";
import type * as lib_fileCheck from "../lib/fileCheck.js";
import type * as lib_locales from "../lib/locales.js";
import type * as lib_manuscripts from "../lib/manuscripts.js";
import type * as lib_membershipEmails from "../lib/membershipEmails.js";
import type * as lib_membershipGrant from "../lib/membershipGrant.js";
import type * as lib_moderationHistory from "../lib/moderationHistory.js";
import type * as lib_newsletterContent from "../lib/newsletterContent.js";
import type * as lib_newsletterDelivery from "../lib/newsletterDelivery.js";
import type * as lib_newsletterOptIn from "../lib/newsletterOptIn.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_onboarding from "../lib/onboarding.js";
import type * as lib_orgMembership from "../lib/orgMembership.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_passwordPolicy from "../lib/passwordPolicy.js";
import type * as lib_payments_amounts from "../lib/payments/amounts.js";
import type * as lib_payments_config from "../lib/payments/config.js";
import type * as lib_payments_crypto from "../lib/payments/crypto.js";
import type * as lib_payments_emails from "../lib/payments/emails.js";
import type * as lib_payments_fake from "../lib/payments/fake.js";
import type * as lib_payments_ledger from "../lib/payments/ledger.js";
import type * as lib_payments_receiptPdf from "../lib/payments/receiptPdf.js";
import type * as lib_payments_registry from "../lib/payments/registry.js";
import type * as lib_payments_stripe from "../lib/payments/stripe.js";
import type * as lib_payments_types from "../lib/payments/types.js";
import type * as lib_payments_validators from "../lib/payments/validators.js";
import type * as lib_pdfAnonymize from "../lib/pdfAnonymize.js";
import type * as lib_pdfImages from "../lib/pdfImages.js";
import type * as lib_programmes from "../lib/programmes.js";
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
import type * as lib_reviewChiefs from "../lib/reviewChiefs.js";
import type * as lib_reviewState from "../lib/reviewState.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_searchSources from "../lib/searchSources.js";
import type * as lib_searchText from "../lib/searchText.js";
import type * as lib_secretBox from "../lib/secretBox.js";
import type * as lib_signIn from "../lib/signIn.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_social from "../lib/social.js";
import type * as lib_socialAccess from "../lib/socialAccess.js";
import type * as lib_socialEmail from "../lib/socialEmail.js";
import type * as lib_tables_communaute from "../lib/tables/communaute.js";
import type * as lib_tables_comptes from "../lib/tables/comptes.js";
import type * as lib_tables_contenus from "../lib/tables/contenus.js";
import type * as lib_tables_diffusion from "../lib/tables/diffusion.js";
import type * as lib_tables_editorial from "../lib/tables/editorial.js";
import type * as lib_tables_paiements from "../lib/tables/paiements.js";
import type * as lib_tables_programmes from "../lib/tables/programmes.js";
import type * as lib_tables_social from "../lib/tables/social.js";
import type * as lib_themes from "../lib/themes.js";
import type * as lib_totp from "../lib/totp.js";
import type * as lib_translation from "../lib/translation.js";
import type * as lib_validation from "../lib/validation.js";
import type * as mentoring from "../mentoring.js";
import type * as mentorship from "../mentorship.js";
import type * as newsletter from "../newsletter.js";
import type * as newsletterHttp from "../newsletterHttp.js";
import type * as notifications from "../notifications.js";
import type * as orgAdmin from "../orgAdmin.js";
import type * as organizations from "../organizations.js";
import type * as otp from "../otp.js";
import type * as passwordReset from "../passwordReset.js";
import type * as payments_checkout from "../payments/checkout.js";
import type * as payments_fake from "../payments/fake.js";
import type * as payments_finances from "../payments/finances.js";
import type * as payments_member from "../payments/member.js";
import type * as payments_plans from "../payments/plans.js";
import type * as payments_receipts from "../payments/receipts.js";
import type * as payments_receiptsNode from "../payments/receiptsNode.js";
import type * as payments_recurring from "../payments/recurring.js";
import type * as payments_webhooks from "../payments/webhooks.js";
import type * as peerReview from "../peerReview.js";
import type * as peerReviewFiles from "../peerReviewFiles.js";
import type * as programmes from "../programmes.js";
import type * as projectCalls from "../projectCalls.js";
import type * as projects from "../projects.js";
import type * as publications from "../publications.js";
import type * as reportPdfNode from "../reportPdfNode.js";
import type * as search from "../search.js";
import type * as searchIndexing from "../searchIndexing.js";
import type * as seed from "../seed.js";
import type * as seedPublications from "../seedPublications.js";
import type * as social_account from "../social/account.js";
import type * as social_follows from "../social/follows.js";
import type * as social_messages from "../social/messages.js";
import type * as social_profiles from "../social/profiles.js";
import type * as toolbox from "../toolbox.js";
import type * as translation from "../translation.js";
import type * as tribune from "../tribune.js";
import type * as twoFactor from "../twoFactor.js";
import type * as users from "../users.js";
import type * as workspaceFiles from "../workspaceFiles.js";
import type * as workspaces from "../workspaces.js";
import type * as youth from "../youth.js";
import type * as youthProfiles from "../youthProfiles.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountNotices: typeof accountNotices;
  accounts: typeof accounts;
  admin: typeof admin;
  aiModeration: typeof aiModeration;
  annualReports: typeof annualReports;
  audience: typeof audience;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  communaute: typeof communaute;
  communityModeration: typeof communityModeration;
  contact: typeof contact;
  "contenus/devCleanup": typeof contenus_devCleanup;
  "contenus/events": typeof contenus_events;
  "contenus/media": typeof contenus_media;
  "contenus/migration": typeof contenus_migration;
  "contenus/news": typeof contenus_news;
  "contenus/partners": typeof contenus_partners;
  "contenus/press": typeof contenus_press;
  "contenus/replays": typeof contenus_replays;
  "contenus/themes": typeof contenus_themes;
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
  "lib/accountAccess": typeof lib_accountAccess;
  "lib/accountDeletion": typeof lib_accountDeletion;
  "lib/accountEmails": typeof lib_accountEmails;
  "lib/aiGateway": typeof lib_aiGateway;
  "lib/aiModeration": typeof lib_aiModeration;
  "lib/annualReports": typeof lib_annualReports;
  "lib/annualReportsCoded": typeof lib_annualReportsCoded;
  "lib/audience": typeof lib_audience;
  "lib/audit": typeof lib_audit;
  "lib/auditActions": typeof lib_auditActions;
  "lib/communaute": typeof lib_communaute;
  "lib/contenus/access": typeof lib_contenus_access;
  "lib/contenus/coded/events": typeof lib_contenus_coded_events;
  "lib/contenus/coded/news": typeof lib_contenus_coded_news;
  "lib/contenus/coded/partners": typeof lib_contenus_coded_partners;
  "lib/contenus/coded/themes": typeof lib_contenus_coded_themes;
  "lib/contenus/events": typeof lib_contenus_events;
  "lib/contenus/fixtures": typeof lib_contenus_fixtures;
  "lib/contenus/i18n": typeof lib_contenus_i18n;
  "lib/contenus/media": typeof lib_contenus_media;
  "lib/contenus/time": typeof lib_contenus_time;
  "lib/contenus/userData": typeof lib_contenus_userData;
  "lib/contenus/validate": typeof lib_contenus_validate;
  "lib/counters": typeof lib_counters;
  "lib/directory": typeof lib_directory;
  "lib/documents": typeof lib_documents;
  "lib/emailContent": typeof lib_emailContent;
  "lib/emailLayout": typeof lib_emailLayout;
  "lib/fileCheck": typeof lib_fileCheck;
  "lib/locales": typeof lib_locales;
  "lib/manuscripts": typeof lib_manuscripts;
  "lib/membershipEmails": typeof lib_membershipEmails;
  "lib/membershipGrant": typeof lib_membershipGrant;
  "lib/moderationHistory": typeof lib_moderationHistory;
  "lib/newsletterContent": typeof lib_newsletterContent;
  "lib/newsletterDelivery": typeof lib_newsletterDelivery;
  "lib/newsletterOptIn": typeof lib_newsletterOptIn;
  "lib/notify": typeof lib_notify;
  "lib/onboarding": typeof lib_onboarding;
  "lib/orgMembership": typeof lib_orgMembership;
  "lib/pagination": typeof lib_pagination;
  "lib/passwordPolicy": typeof lib_passwordPolicy;
  "lib/payments/amounts": typeof lib_payments_amounts;
  "lib/payments/config": typeof lib_payments_config;
  "lib/payments/crypto": typeof lib_payments_crypto;
  "lib/payments/emails": typeof lib_payments_emails;
  "lib/payments/fake": typeof lib_payments_fake;
  "lib/payments/ledger": typeof lib_payments_ledger;
  "lib/payments/receiptPdf": typeof lib_payments_receiptPdf;
  "lib/payments/registry": typeof lib_payments_registry;
  "lib/payments/stripe": typeof lib_payments_stripe;
  "lib/payments/types": typeof lib_payments_types;
  "lib/payments/validators": typeof lib_payments_validators;
  "lib/pdfAnonymize": typeof lib_pdfAnonymize;
  "lib/pdfImages": typeof lib_pdfImages;
  "lib/programmes": typeof lib_programmes;
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
  "lib/reviewChiefs": typeof lib_reviewChiefs;
  "lib/reviewState": typeof lib_reviewState;
  "lib/roles": typeof lib_roles;
  "lib/search": typeof lib_search;
  "lib/searchSources": typeof lib_searchSources;
  "lib/searchText": typeof lib_searchText;
  "lib/secretBox": typeof lib_secretBox;
  "lib/signIn": typeof lib_signIn;
  "lib/slug": typeof lib_slug;
  "lib/social": typeof lib_social;
  "lib/socialAccess": typeof lib_socialAccess;
  "lib/socialEmail": typeof lib_socialEmail;
  "lib/tables/communaute": typeof lib_tables_communaute;
  "lib/tables/comptes": typeof lib_tables_comptes;
  "lib/tables/contenus": typeof lib_tables_contenus;
  "lib/tables/diffusion": typeof lib_tables_diffusion;
  "lib/tables/editorial": typeof lib_tables_editorial;
  "lib/tables/paiements": typeof lib_tables_paiements;
  "lib/tables/programmes": typeof lib_tables_programmes;
  "lib/tables/social": typeof lib_tables_social;
  "lib/themes": typeof lib_themes;
  "lib/totp": typeof lib_totp;
  "lib/translation": typeof lib_translation;
  "lib/validation": typeof lib_validation;
  mentoring: typeof mentoring;
  mentorship: typeof mentorship;
  newsletter: typeof newsletter;
  newsletterHttp: typeof newsletterHttp;
  notifications: typeof notifications;
  orgAdmin: typeof orgAdmin;
  organizations: typeof organizations;
  otp: typeof otp;
  passwordReset: typeof passwordReset;
  "payments/checkout": typeof payments_checkout;
  "payments/fake": typeof payments_fake;
  "payments/finances": typeof payments_finances;
  "payments/member": typeof payments_member;
  "payments/plans": typeof payments_plans;
  "payments/receipts": typeof payments_receipts;
  "payments/receiptsNode": typeof payments_receiptsNode;
  "payments/recurring": typeof payments_recurring;
  "payments/webhooks": typeof payments_webhooks;
  peerReview: typeof peerReview;
  peerReviewFiles: typeof peerReviewFiles;
  programmes: typeof programmes;
  projectCalls: typeof projectCalls;
  projects: typeof projects;
  publications: typeof publications;
  reportPdfNode: typeof reportPdfNode;
  search: typeof search;
  searchIndexing: typeof searchIndexing;
  seed: typeof seed;
  seedPublications: typeof seedPublications;
  "social/account": typeof social_account;
  "social/follows": typeof social_follows;
  "social/messages": typeof social_messages;
  "social/profiles": typeof social_profiles;
  toolbox: typeof toolbox;
  translation: typeof translation;
  tribune: typeof tribune;
  twoFactor: typeof twoFactor;
  users: typeof users;
  workspaceFiles: typeof workspaceFiles;
  workspaces: typeof workspaces;
  youth: typeof youth;
  youthProfiles: typeof youthProfiles;
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
