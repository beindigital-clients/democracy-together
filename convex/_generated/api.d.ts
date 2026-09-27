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
import type * as audience from "../audience.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as contact from "../contact.js";
import type * as counters from "../counters.js";
import type * as crons from "../crons.js";
import type * as devAdmin from "../devAdmin.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as eventReminders from "../eventReminders.js";
import type * as events from "../events.js";
import type * as experts from "../experts.js";
import type * as http from "../http.js";
import type * as impact from "../impact.js";
import type * as journal from "../journal.js";
import type * as lib_aiGateway from "../lib/aiGateway.js";
import type * as lib_aiModeration from "../lib/aiModeration.js";
import type * as lib_audience from "../lib/audience.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auditActions from "../lib/auditActions.js";
import type * as lib_counters from "../lib/counters.js";
import type * as lib_directory from "../lib/directory.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_emailContent from "../lib/emailContent.js";
import type * as lib_locales from "../lib/locales.js";
import type * as lib_newsletterContent from "../lib/newsletterContent.js";
import type * as lib_newsletterDelivery from "../lib/newsletterDelivery.js";
import type * as lib_newsletterOptIn from "../lib/newsletterOptIn.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_onboarding from "../lib/onboarding.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_passwordPolicy from "../lib/passwordPolicy.js";
import type * as lib_payments_amounts from "../lib/payments/amounts.js";
import type * as lib_payments_config from "../lib/payments/config.js";
import type * as lib_payments_crypto from "../lib/payments/crypto.js";
import type * as lib_payments_emails from "../lib/payments/emails.js";
import type * as lib_payments_fake from "../lib/payments/fake.js";
import type * as lib_payments_ledger from "../lib/payments/ledger.js";
import type * as lib_payments_paydunya from "../lib/payments/paydunya.js";
import type * as lib_payments_receiptPdf from "../lib/payments/receiptPdf.js";
import type * as lib_payments_registry from "../lib/payments/registry.js";
import type * as lib_payments_stripe from "../lib/payments/stripe.js";
import type * as lib_payments_types from "../lib/payments/types.js";
import type * as lib_payments_validators from "../lib/payments/validators.js";
import type * as lib_pdfImages from "../lib/pdfImages.js";
import type * as lib_publications from "../lib/publications.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_recaptcha from "../lib/recaptcha.js";
import type * as lib_reviewState from "../lib/reviewState.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_searchSources from "../lib/searchSources.js";
import type * as lib_searchText from "../lib/searchText.js";
import type * as lib_signIn from "../lib/signIn.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_social from "../lib/social.js";
import type * as lib_socialAccess from "../lib/socialAccess.js";
import type * as lib_socialEmail from "../lib/socialEmail.js";
import type * as lib_tables_diffusion from "../lib/tables/diffusion.js";
import type * as lib_tables_paiements from "../lib/tables/paiements.js";
import type * as lib_tables_social from "../lib/tables/social.js";
import type * as lib_themes from "../lib/themes.js";
import type * as lib_translation from "../lib/translation.js";
import type * as lib_validation from "../lib/validation.js";
import type * as mentorship from "../mentorship.js";
import type * as newsletter from "../newsletter.js";
import type * as newsletterHttp from "../newsletterHttp.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as otp from "../otp.js";
import type * as payments_checkout from "../payments/checkout.js";
import type * as payments_fake from "../payments/fake.js";
import type * as payments_finances from "../payments/finances.js";
import type * as payments_member from "../payments/member.js";
import type * as payments_plans from "../payments/plans.js";
import type * as payments_receipts from "../payments/receipts.js";
import type * as payments_recurring from "../payments/recurring.js";
import type * as payments_webhooks from "../payments/webhooks.js";
import type * as peerReview from "../peerReview.js";
import type * as projects from "../projects.js";
import type * as publications from "../publications.js";
import type * as search from "../search.js";
import type * as searchIndexing from "../searchIndexing.js";
import type * as seed from "../seed.js";
import type * as seedPublications from "../seedPublications.js";
import type * as social_account from "../social/account.js";
import type * as social_follows from "../social/follows.js";
import type * as social_messages from "../social/messages.js";
import type * as social_profiles from "../social/profiles.js";
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
  audience: typeof audience;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  contact: typeof contact;
  counters: typeof counters;
  crons: typeof crons;
  devAdmin: typeof devAdmin;
  documents: typeof documents;
  email: typeof email;
  eventReminders: typeof eventReminders;
  events: typeof events;
  experts: typeof experts;
  http: typeof http;
  impact: typeof impact;
  journal: typeof journal;
  "lib/aiGateway": typeof lib_aiGateway;
  "lib/aiModeration": typeof lib_aiModeration;
  "lib/audience": typeof lib_audience;
  "lib/audit": typeof lib_audit;
  "lib/auditActions": typeof lib_auditActions;
  "lib/counters": typeof lib_counters;
  "lib/directory": typeof lib_directory;
  "lib/documents": typeof lib_documents;
  "lib/emailContent": typeof lib_emailContent;
  "lib/locales": typeof lib_locales;
  "lib/newsletterContent": typeof lib_newsletterContent;
  "lib/newsletterDelivery": typeof lib_newsletterDelivery;
  "lib/newsletterOptIn": typeof lib_newsletterOptIn;
  "lib/notify": typeof lib_notify;
  "lib/onboarding": typeof lib_onboarding;
  "lib/pagination": typeof lib_pagination;
  "lib/passwordPolicy": typeof lib_passwordPolicy;
  "lib/payments/amounts": typeof lib_payments_amounts;
  "lib/payments/config": typeof lib_payments_config;
  "lib/payments/crypto": typeof lib_payments_crypto;
  "lib/payments/emails": typeof lib_payments_emails;
  "lib/payments/fake": typeof lib_payments_fake;
  "lib/payments/ledger": typeof lib_payments_ledger;
  "lib/payments/paydunya": typeof lib_payments_paydunya;
  "lib/payments/receiptPdf": typeof lib_payments_receiptPdf;
  "lib/payments/registry": typeof lib_payments_registry;
  "lib/payments/stripe": typeof lib_payments_stripe;
  "lib/payments/types": typeof lib_payments_types;
  "lib/payments/validators": typeof lib_payments_validators;
  "lib/pdfImages": typeof lib_pdfImages;
  "lib/publications": typeof lib_publications;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/rbac": typeof lib_rbac;
  "lib/recaptcha": typeof lib_recaptcha;
  "lib/reviewState": typeof lib_reviewState;
  "lib/roles": typeof lib_roles;
  "lib/search": typeof lib_search;
  "lib/searchSources": typeof lib_searchSources;
  "lib/searchText": typeof lib_searchText;
  "lib/signIn": typeof lib_signIn;
  "lib/slug": typeof lib_slug;
  "lib/social": typeof lib_social;
  "lib/socialAccess": typeof lib_socialAccess;
  "lib/socialEmail": typeof lib_socialEmail;
  "lib/tables/diffusion": typeof lib_tables_diffusion;
  "lib/tables/paiements": typeof lib_tables_paiements;
  "lib/tables/social": typeof lib_tables_social;
  "lib/themes": typeof lib_themes;
  "lib/translation": typeof lib_translation;
  "lib/validation": typeof lib_validation;
  mentorship: typeof mentorship;
  newsletter: typeof newsletter;
  newsletterHttp: typeof newsletterHttp;
  notifications: typeof notifications;
  organizations: typeof organizations;
  otp: typeof otp;
  "payments/checkout": typeof payments_checkout;
  "payments/fake": typeof payments_fake;
  "payments/finances": typeof payments_finances;
  "payments/member": typeof payments_member;
  "payments/plans": typeof payments_plans;
  "payments/receipts": typeof payments_receipts;
  "payments/recurring": typeof payments_recurring;
  "payments/webhooks": typeof payments_webhooks;
  peerReview: typeof peerReview;
  projects: typeof projects;
  publications: typeof publications;
  search: typeof search;
  searchIndexing: typeof searchIndexing;
  seed: typeof seed;
  seedPublications: typeof seedPublications;
  "social/account": typeof social_account;
  "social/follows": typeof social_follows;
  "social/messages": typeof social_messages;
  "social/profiles": typeof social_profiles;
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
