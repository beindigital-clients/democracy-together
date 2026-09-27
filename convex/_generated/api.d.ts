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
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as contact from "../contact.js";
import type * as contenus_devCleanup from "../contenus/devCleanup.js";
import type * as contenus_events from "../contenus/events.js";
import type * as contenus_media from "../contenus/media.js";
import type * as contenus_migration from "../contenus/migration.js";
import type * as contenus_partners from "../contenus/partners.js";
import type * as contenus_press from "../contenus/press.js";
import type * as contenus_replays from "../contenus/replays.js";
import type * as contenus_themes from "../contenus/themes.js";
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
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auditActions from "../lib/auditActions.js";
import type * as lib_contenus_access from "../lib/contenus/access.js";
import type * as lib_contenus_coded_events from "../lib/contenus/coded/events.js";
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
import type * as lib_locales from "../lib/locales.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_onboarding from "../lib/onboarding.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_passwordPolicy from "../lib/passwordPolicy.js";
import type * as lib_pdfImages from "../lib/pdfImages.js";
import type * as lib_publications from "../lib/publications.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_recaptcha from "../lib/recaptcha.js";
import type * as lib_reviewState from "../lib/reviewState.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_signIn from "../lib/signIn.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_tables_contenus from "../lib/tables/contenus.js";
import type * as lib_themes from "../lib/themes.js";
import type * as lib_translation from "../lib/translation.js";
import type * as lib_validation from "../lib/validation.js";
import type * as mentorship from "../mentorship.js";
import type * as newsletter from "../newsletter.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as otp from "../otp.js";
import type * as peerReview from "../peerReview.js";
import type * as projects from "../projects.js";
import type * as publications from "../publications.js";
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
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  contact: typeof contact;
  "contenus/devCleanup": typeof contenus_devCleanup;
  "contenus/events": typeof contenus_events;
  "contenus/media": typeof contenus_media;
  "contenus/migration": typeof contenus_migration;
  "contenus/partners": typeof contenus_partners;
  "contenus/press": typeof contenus_press;
  "contenus/replays": typeof contenus_replays;
  "contenus/themes": typeof contenus_themes;
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
  "lib/audit": typeof lib_audit;
  "lib/auditActions": typeof lib_auditActions;
  "lib/contenus/access": typeof lib_contenus_access;
  "lib/contenus/coded/events": typeof lib_contenus_coded_events;
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
  "lib/locales": typeof lib_locales;
  "lib/notify": typeof lib_notify;
  "lib/onboarding": typeof lib_onboarding;
  "lib/pagination": typeof lib_pagination;
  "lib/passwordPolicy": typeof lib_passwordPolicy;
  "lib/pdfImages": typeof lib_pdfImages;
  "lib/publications": typeof lib_publications;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/rbac": typeof lib_rbac;
  "lib/recaptcha": typeof lib_recaptcha;
  "lib/reviewState": typeof lib_reviewState;
  "lib/roles": typeof lib_roles;
  "lib/search": typeof lib_search;
  "lib/signIn": typeof lib_signIn;
  "lib/slug": typeof lib_slug;
  "lib/tables/contenus": typeof lib_tables_contenus;
  "lib/themes": typeof lib_themes;
  "lib/translation": typeof lib_translation;
  "lib/validation": typeof lib_validation;
  mentorship: typeof mentorship;
  newsletter: typeof newsletter;
  notifications: typeof notifications;
  organizations: typeof organizations;
  otp: typeof otp;
  peerReview: typeof peerReview;
  projects: typeof projects;
  publications: typeof publications;
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
