import { ConvexError, v } from 'convex/values';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { networkRole } from './schema';
import { locale, type SiteLocale } from './lib/locales';
import { enforceRecaptcha } from './lib/recaptcha';
import {
  requireNetworkRole,
  getActiveUserId,
  rank,
  effectiveRole,
} from './lib/rbac';
import { recordAudit } from './lib/audit';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import {
  accountToElevate,
  approvedMember,
  planWithdrawal,
} from './lib/membershipGrant';
import {
  COUNTER,
  bumpCounter,
  readCounter,
  trackMembershipApplicationStatus,
  trackOrganizationStatus,
} from './lib/counters';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import {
  matchesFilters,
  computeFacets,
  directoryRegionValidator,
  directoryThemeValidator,
  directoryFacetsValidator,
  projectOrganization,
  publicOrganizationValidator,
  countryTerms,
} from './lib/directory';
import { isEmail, isReservedEmail, FIELD_MAX } from './lib/validation';
import {
  consumeRateLimit,
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { slugify } from './lib/slug';
import { organizationSearchText } from './lib/searchText';
import { emailProviderStatus, sendEmail } from './email';
import {
  normalizeEmail,
  validateDirectoryFields,
  invitationEmail,
  type DirectoryFields,
} from './lib/onboarding';
import {
  applicationDeclinedEmail,
  applicationReceivedEmail,
  staffApplicationAlertEmail,
} from './lib/membershipEmails';

const applicantType = v.union(v.literal('organisation'), v.literal('individu'));

const HOUR = 60 * 60 * 1000;

// Where a notification about the queue leads staff.
const APPLICATIONS_QUEUE = '/admin/candidatures';

// Public directory of think tanks (F-19): filtered list + facets computed
// over all active members (so as to offer only useful filters).
// Server-side rendering, filters in the URL -> SEO + low bandwidth (F-05/F-07).
export const listDirectory = query({
  args: {
    // `region` and `theme` are CLOSED domains (see lib/directory); only
    // `q`, full-text search, is free text. The caller
    // (src/app/[locale]/le-reseau/page.tsx) sanitizes the URL parameters
    // upstream: a bogus `?region=` means "no filter", and not an
    // argument error on a public page.
    region: v.optional(directoryRegionValidator),
    theme: v.optional(directoryThemeValidator),
    // Country and language (F-19, added on 27/09): ISO codes read from the profiles,
    // open domain — the caller checks the format (`isCountryCode`).
    country: v.optional(v.string()),
    language: v.optional(v.string()),
    q: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(publicOrganizationValidator),
    facets: directoryFacetsValidator,
    total: v.number(),
  }),
  handler: async (ctx, { region, theme, country, language, q }) => {
    const active = await ctx.db
      .query('organizations')
      .withIndex('by_status', (qi) => qi.eq('status', 'active'))
      .collect();
    const items = active
      .filter((o) => matchesFilters(o, { region, theme, country, language, q }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(projectOrganization);
    return { items, facets: computeFacets(active), total: active.length };
  },
});

// Member profile (F-21) — public: returns ONLY active organizations.
// Status filtering lives in the query (and not in the caller) so that no
// consumer can expose a pending/suspended profile.
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(publicOrganizationValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    // The status filter stays here, and `status` is no longer returned: a
    // pending/suspended profile is indistinguishable from a non-existent one.
    return org && org.status === 'active' ? projectOrganization(org) : null;
  },
});

// Membership application (F-22) — open to the public; we link the signed-in
// user. Validated server-side (defense in depth, the UI validates too).
//
// Anti-spam gate: the action checks reCAPTCHA v3 then delegates to
// `storeApplication` (internalMutation). The signed-in user's identity
// is propagated through ctx.runMutation -> the applicantUserId link holds.
export const submitApplication = action({
  args: {
    type: v.union(v.literal('organisation'), v.literal('individu')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'membership');
    // Explicit annotation: breaks the TS type circularity (see guidelines).
    const id: Id<'membershipApplications'> = await ctx.runMutation(
      internal.organizations.storeApplication,
      input,
    );
    return id;
  },
});

// Read bound on the pending queue for the deduplication below:
// beyond it, the queue is no longer a moderation queue but a backlog, and any
// duplicate would be visible to the moderator anyway.
const PENDING_APPLICATIONS_MAX = 500;

// ONLY ONE PENDING APPLICATION PER ADDRESS — checked when an application is
// submitted, and when a decided one is put back under review. The pending
// queue is short by construction (it is emptied by hand, by a moderator):
// reading it through the `by_status` index stays bounded, with no extra index
// on the address. The comparison is normalized the way approval will do it
// (`normalizeEmail`): "Contact@X.org" and "contact@x.org" are the same person.
async function hasPendingApplication(
  ctx: MutationCtx,
  contactEmail: string,
  except?: Id<'membershipApplications'>,
): Promise<boolean> {
  const wanted = normalizeEmail(contactEmail);
  const pending = await ctx.db
    .query('membershipApplications')
    .withIndex('by_status', (q) => q.eq('status', 'pending'))
    .take(PENDING_APPLICATIONS_MAX);
  return pending.some(
    (a) => a._id !== except && normalizeEmail(a.contactEmail) === wanted,
  );
}

export const storeApplication = internalMutation({
  args: {
    type: v.union(v.literal('organisation'), v.literal('individu')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const organizationName = args.organizationName.trim();
    const contactEmail = args.contactEmail.trim();
    const country = args.country.trim();
    const message = args.message?.trim() || undefined;

    // UPPER bounds as well as lower ones (pentest M-2, "stuffing"): this
    // form is anonymous and had none.
    if (
      organizationName.length < 2 ||
      organizationName.length > FIELD_MAX.name
    ) {
      throw new Error('INVALID_NAME');
    }
    if (!isEmail(contactEmail)) throw new Error('INVALID_EMAIL');
    if (country.length < 2 || country.length > FIELD_MAX.country) {
      throw new Error('INVALID_COUNTRY');
    }
    if (message !== undefined && message.length > FIELD_MAX.body) {
      throw new Error('INVALID_MESSAGE');
    }

    // UNFORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. See lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'apply');

    await enforceRateLimit(ctx, {
      key: `apply:${contactEmail.toLowerCase()}`,
      ...RATE_LIMITS.apply,
    });

    // ONLY ONE PENDING APPLICATION PER ADDRESS. Two submissions — a late double
    // click, a second attempt after a doubt — produced two `pending` rows
    // that the back-office saw twice (measured on 27/09, showcase
    // O3 / R-09). `ConvexError`: `data` travels through the action to the
    // form, which can say "an application is already in progress".
    if (await hasPendingApplication(ctx, contactEmail)) {
      throw new ConvexError('DUPLICATE_APPLICATION');
    }

    const userId = await getActiveUserId(ctx);
    const applicationId = await ctx.db.insert('membershipApplications', {
      type: args.type,
      organizationName,
      contactEmail,
      country,
      message,
      status: 'pending',
      submittedAt: Date.now(),
      ...(args.locale ? { locale: args.locale } : {}),
      ...(userId ? { applicantUserId: userId } : {}),
    });
    await trackMembershipApplicationStatus(ctx, null, 'pending');

    // WHO HEARS OF IT. Until now, nobody: staff found an application only by
    // opening the back office, and the applicant got nothing past the
    // screen's "Candidature reçue". Both go out from here, in the
    // application's transaction — an application refused above (caps,
    // duplicate) alerts no one.
    await alertStaffOfApplication(ctx, {
      organizationName,
      type: args.type,
      country,
    });
    if (!isReservedEmail(contactEmail)) {
      await ctx.scheduler.runAfter(
        0,
        internal.organizations.sendApplicationReceipt,
        {
          email: normalizeEmail(contactEmail),
          locale: args.locale ?? 'fr',
        },
      );
    }
    return applicationId;
  },
});

// --- Telling staff that an application is waiting ---------------------------
//
// Every rank that can decide an application (`reviewApplication` opens at
// moderator) gets it in the bell, with a link to the queue; those who have
// not turned the alert off also get it by e-mail — that is how an
// administrator who does not live in the back office hears of it the same
// day. Read per role through the `by_role` index and bounded: staff is a
// handful of accounts.
const STAFF_ROLES = ['moderateur', 'editeur', 'admin'] as const;
const STAFF_PER_ROLE_MAX = 50;

// E-MAIL alerts to staff, all applications together. The form is public:
// flooded — 100 submissions an hour pass its global cap — it would bury
// every staff inbox. Past this cap the e-mails stop; the bell and the
// dashboard counter keep counting.
export const STAFF_ALERT_EMAIL_LIMIT = { max: 10, windowMs: HOUR };

async function alertStaffOfApplication(
  ctx: MutationCtx,
  application: {
    organizationName: string;
    type: Doc<'membershipApplications'>['type'];
    country: string;
  },
): Promise<void> {
  const recipients: { email: string; locale: SiteLocale }[] = [];
  for (const role of STAFF_ROLES) {
    const staff = await ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', role))
      .take(STAFF_PER_ROLE_MAX);
    for (const member of staff) {
      // A suspended account (or one being deleted) reads nothing: no alert.
      if (member.suspendedAt !== undefined) continue;
      // `false` when the alert is turned off in the profile: then neither
      // the bell nor the e-mail.
      const notified = await notify(ctx, {
        userId: member._id,
        type: 'membership_application',
        titleKey: 'membershipApplicationReceived',
        params: { name: application.organizationName },
        link: APPLICATIONS_QUEUE,
      });
      if (notified && member.email && !isReservedEmail(member.email)) {
        recipients.push({
          email: member.email,
          locale: member.preferredLocale ?? 'fr',
        });
      }
    }
  }
  if (recipients.length === 0) return;
  const underCap = await consumeRateLimit(ctx, {
    key: 'staffAlert:membershipApplication',
    ...STAFF_ALERT_EMAIL_LIMIT,
  });
  if (!underCap) return;
  await ctx.scheduler.runAfter(
    0,
    internal.organizations.sendStaffApplicationAlert,
    {
      recipients,
      ...application,
      pending: await readCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS_PENDING),
    },
  );
}

// DEV/TEST only (AUTH_DEV_OTP guard): reads back the latest application for an
// address, so the E2E can check the actual storage (see otp.latestDevCode).
export const latestApplicationForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const all = await ctx.db
      .query('membershipApplications')
      .order('desc')
      .collect();
    const a = all.find((x) => x.contactEmail === email);
    return a
      ? {
          organizationName: a.organizationName,
          type: a.type,
          status: a.status,
          country: a.country,
        }
      : null;
  },
});

// --- State machine for the membership review (audit M6 · issue #9) ---------
//
//   pending ──reviewApplication──► approved | rejected
//   approved | rejected ──reopenApplication──► pending
//
// A decision is not replayed, nor reversed by a click on the other button:
// re-approving created duplicate accounts and profiles, and "rejecting" an
// approved application left the granted role in place. Going back on a
// decision — rescuing a rejected application, putting an approved one back
// under review — is the named transition `reopenApplication`: recorded under
// `membership.reopened`, and, from an approval, taking back what the approval
// granted (lib/membershipGrant.ts).
const MEMBERSHIP_REVIEW: ReviewMachine<
  Doc<'membershipApplications'>['status']
> = {
  transitions: {
    pending: ['approved', 'rejected'],
    approved: ['pending'],
    rejected: ['pending'],
  },
  decided: ['approved', 'rejected'],
};

// Approval of an application (F-22 / F-26) — moderator and above, audited.
//
// This is where the audit's blocker #1 lay: approval merely
// raised the role of an ALREADY existing account. Since self-signup was
// removed, an applicant who had never created an account could therefore
// never sign in (sign-in refuses an unknown email), and
// no organization entered the directory. Approval now creates
// the three missing objects: the ACCOUNT, the ORGANIZATION and the LINK.
export const reviewApplication = mutation({
  args: {
    applicationId: v.id('membershipApplications'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
    // Directory fields entered by the moderator (F-19). The application only
    // collects a country as free text; without these fields, the profile would be
    // published with a made-up region and themes. Missing -> the profile
    // is created as 'pending' and stays out of the public directory, but the account
    // is created anyway: the member can sign in immediately.
    directory: v.optional(
      v.object({
        countryCode: v.string(),
        region: v.string(),
        themes: v.array(v.string()),
        languages: v.array(v.string()),
        description: v.optional(v.string()),
        websiteUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { applicationId, decision, notes, directory }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');
    // State machine (audit M6): an application already decided is not
    // replayed — `ALREADY_REVIEWED`. Going back on it is `reopenApplication`.
    assertTransition(application.status, decision, MEMBERSHIP_REVIEW);

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewNotes: notes,
      reviewedAt: now,
    });
    await trackMembershipApplicationStatus(ctx, application.status, decision);

    if (decision === 'rejected') {
      // The account the decision concerns: the one that submitted the
      // application or — an approval put back under review, then turned
      // down — the one that approval had made a member, which must hear that
      // it no longer is. Deleted since: nobody to tell in the application.
      const concerned = application.applicantUserId ?? application.memberUserId;
      if (concerned && (await ctx.db.get(concerned))) {
        await notify(ctx, {
          userId: concerned,
          type: 'membership_rejected',
          titleKey: 'membershipRejected',
          link: '/adhesion',
        });
      }
      // The form promised "nous reviendrons vers vous par e-mail". The
      // notification above only reaches an applicant who HAS an account —
      // hardly anyone, self-registration being closed: the others never
      // heard back. The moderator's note is internal and does not travel.
      const contact = normalizeEmail(application.contactEmail);
      if (!isReservedEmail(contact)) {
        await ctx.scheduler.runAfter(
          0,
          internal.organizations.sendApplicationDecline,
          { email: contact, locale: application.locale ?? 'fr' },
        );
      }
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.MEMBERSHIP_REVIEWED,
        targetId: applicationId,
        metadata: { decision },
      });
      return { userCreated: false, organizationId: null };
    }

    // --- 1) The ACCOUNT -------------------------------------------------------
    // Normalized exactly as sign-in will do it, otherwise the approved member
    // will never find their account.
    const email = normalizeEmail(application.contactEmail);
    let user = await accountToElevate(ctx, application);
    let userCreated = false;
    // Whether THIS approval gives the account its `membre` role: what a
    // reversal may take back (lib/membershipGrant.ts).
    let roleRaised = false;
    if (!user) {
      const id = await ctx.db.insert('users', { email, role: 'membre' });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      user = (await ctx.db.get(id))!;
      userCreated = true;
      roleRaised = true;
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.USER_INVITED,
        targetId: id,
        metadata: { via: 'membership', email },
      });
    } else if (rank(user.role) < rank('membre')) {
      // We NEVER overwrite a higher role.
      await ctx.db.patch(user._id, { role: 'membre' });
      roleRaised = true;
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.USER_ROLE_CHANGED,
        targetId: user._id,
        metadata: { role: 'membre', via: 'membership' },
      });
    }
    await ctx.db.patch(applicationId, { memberUserId: user._id, roleRaised });

    // --- 2) The ORGANIZATION and 3) the LINK ---------------------------------
    let organizationId: Id<'organizations'> | null = null;
    let organizationReinstated = false;
    if (application.type === 'organisation') {
      const fields = directory ? validateDirectoryFields(directory) : null;
      if (fields && !fields.ok) throw new Error(fields.reason);
      const d = fields && fields.ok ? fields.value : null;
      // An approval put back under review, then approved again: the profile
      // it created comes back — not a second one next to it.
      const previous = application.createdOrgId
        ? await ctx.db.get(application.createdOrgId)
        : null;
      if (previous) {
        organizationId = await reinstateOrganization(
          ctx,
          previous,
          d,
          user._id,
          now,
        );
        organizationReinstated = true;
      } else {
        organizationId = await createOrganization(ctx, {
          application,
          fields: d,
          ownerId: user._id,
          reviewerId: reviewer._id,
          now,
        });
      }
    }

    await notify(ctx, {
      userId: user._id,
      type: 'membership_approved',
      titleKey: 'membershipApproved',
      link: '/espace-membre',
    });

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MEMBERSHIP_REVIEWED,
      targetId: applicationId,
      metadata: {
        decision,
        ...(organizationReinstated ? { organizationReinstated: true } : {}),
      },
    });

    // The email goes out in a scheduled ACTION (never fetch in a mutation).
    // Its failure does not undo the approval: the account already exists, and
    // the invitation can be resent from the back-office
    // (`resendMembershipInvitation`).
    await ctx.scheduler.runAfter(
      0,
      internal.organizations.sendMembershipInvitation,
      {
        applicationId,
        email: invitationRecipient(user, email),
        organizationName: application.organizationName,
        // Language recorded when the application was submitted. Missing on
        // applications predating this field: the fallback stays French.
        locale: application.locale ?? 'fr',
      },
    );

    return { userCreated, organizationId };
  },
});

// The organization of an approved application, created with its manager's
// link. Without directory fields, the profile stays 'pending': better a
// profile to be completed than a false public profile.
async function createOrganization(
  ctx: MutationCtx,
  {
    application,
    fields: d,
    ownerId,
    reviewerId,
    now,
  }: {
    application: Doc<'membershipApplications'>;
    fields: DirectoryFields | null;
    ownerId: Id<'users'>;
    reviewerId: Id<'users'>;
    now: number;
  },
): Promise<Id<'organizations'>> {
  // Unique slug (incremental suffix), as for publications.
  const root = slugify(application.organizationName);
  let slug = root;
  let n = 2;
  while (
    await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first()
  ) {
    slug = `${root}-${n++}`;
  }

  const organizationId = await ctx.db.insert('organizations', {
    name: application.organizationName,
    slug,
    country: d?.countryCode ?? application.country,
    region: d?.region ?? '',
    languages: d?.languages ?? [],
    themes: d?.themes ?? [],
    ...(d?.description ? { description: d.description } : {}),
    ...(d?.websiteUrl ? { websiteUrl: d.websiteUrl } : {}),
    status: d ? 'active' : 'pending',
    createdAt: now,
    // Global search (diffusion workstream): haystack maintained on write.
    searchText: organizationSearchText(
      {
        name: application.organizationName,
        description: d?.description,
        country: d?.countryCode ?? application.country,
      },
      countryTerms,
    ),
  });
  await trackOrganizationStatus(ctx, null, d ? 'active' : 'pending');
  await ctx.db.insert('organizationMemberships', {
    userId: ownerId,
    orgId: organizationId,
    orgRole: 'owner',
    createdAt: now,
  });
  await ctx.db.patch(application._id, { createdOrgId: organizationId });
  await recordAudit(ctx, {
    actorId: reviewerId,
    action: AUDIT.ORGANIZATION_CREATED,
    targetId: organizationId,
    metadata: { slug, status: d ? 'active' : 'pending' },
  });
  return organizationId;
}

// The profile an earlier approval created, back from its suspension (see
// `reopenApplication`): same slug, and what its manager changed through
// revisions in the meantime is kept. Directory fields entered now replace its
// own; without them, it returns to the directory if it is complete, and
// stays "to be completed" otherwise — exactly as a first approval would.
async function reinstateOrganization(
  ctx: MutationCtx,
  org: Doc<'organizations'>,
  fields: DirectoryFields | null,
  ownerId: Id<'users'>,
  now: number,
): Promise<Id<'organizations'>> {
  const complete =
    fields !== null ||
    validateDirectoryFields({
      countryCode: org.country,
      region: org.region,
      themes: org.themes,
      languages: org.languages,
    }).ok;
  const status = complete ? 'active' : 'pending';
  await ctx.db.patch(org._id, {
    status,
    ...(fields
      ? {
          country: fields.countryCode,
          region: fields.region,
          themes: fields.themes,
          languages: fields.languages,
          ...(fields.description ? { description: fields.description } : {}),
          ...(fields.websiteUrl ? { websiteUrl: fields.websiteUrl } : {}),
          searchText: organizationSearchText(
            {
              name: org.name,
              description: fields.description ?? org.description,
              country: fields.countryCode,
            },
            countryTerms,
          ),
          updatedAt: now,
        }
      : {}),
  });
  await trackOrganizationStatus(ctx, org.status, status);
  // Its manager's link: removed in the meantime, or never made for this
  // account (the first one was deleted since, and approval opened another).
  const link = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_org_user', (q) =>
      q.eq('orgId', org._id).eq('userId', ownerId),
    )
    .first();
  if (!link) {
    await ctx.db.insert('organizationMemberships', {
      userId: ownerId,
      orgId: org._id,
      orgRole: 'owner',
      createdAt: now,
    });
  }
  return org._id;
}

// Putting a decision back under review (F-22 / F-26) — moderator and above,
// like the decision itself: whoever can grant a membership can correct it.
//
// The application returns to the queue, where it is decided again with
// `reviewApplication`: a rejected application can be rescued and approved, an
// approved one reconsidered and rejected. Going back on an APPROVAL does not
// wait for the new decision to take back what it granted: while the
// application is pending, its applicant is not a member — the approval was
// the only thing that said so. See lib/membershipGrant.ts for what is
// withdrawn, and what is deliberately left in place.
//
// Nobody is told at this point: the applicant hears of the NEW decision, by
// the usual e-mail — an invitation, or a decline.
export const reopenApplication = mutation({
  args: { applicationId: v.id('membershipApplications') },
  returns: v.object({
    roleWithdrawn: v.boolean(),
    organizationSuspended: v.boolean(),
  }),
  handler: async (ctx, { applicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');
    const from = application.status;
    assertTransition(from, 'pending', MEMBERSHIP_REVIEW);
    // Turned down, the applicant may have applied again since: rescuing the
    // old application would put two of theirs in the queue — and approving
    // both, two profiles. The newer one is the one to decide.
    if (
      await hasPendingApplication(ctx, application.contactEmail, applicationId)
    ) {
      throw new ConvexError('DUPLICATE_APPLICATION');
    }

    let roleWithdrawn = false;
    let organizationSuspended = false;
    if (from === 'approved') {
      const plan = await planWithdrawal(ctx, application);
      if (plan.member && plan.withdrawRole) {
        await ctx.db.patch(plan.member._id, { role: 'visiteur' });
        await recordAudit(ctx, {
          actorId: reviewer._id,
          action: AUDIT.USER_ROLE_CHANGED,
          targetId: plan.member._id,
          metadata: { role: 'visiteur', via: 'membership' },
        });
        roleWithdrawn = true;
      }
      if (plan.organization) {
        await ctx.db.patch(plan.organization._id, { status: 'suspended' });
        await trackOrganizationStatus(
          ctx,
          plan.organization.status,
          'suspended',
        );
        organizationSuspended = true;
      }
    }

    await ctx.db.patch(applicationId, {
      status: 'pending',
      reopenedAt: Date.now(),
      reopenedFrom: from === 'approved' ? 'approved' : 'rejected',
      // The invitation belonged to the approval: the queue must not show it
      // as sent when the next approval's one has not left yet.
      invitedAt: undefined,
    });
    await trackMembershipApplicationStatus(ctx, from, 'pending');
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MEMBERSHIP_REOPENED,
      targetId: applicationId,
      metadata: {
        from,
        roleWithdrawn,
        ...(organizationSuspended
          ? { organizationSuspended: application.createdOrgId }
          : {}),
      },
    });
    return { roleWithdrawn, organizationSuspended };
  },
});

// What putting an APPROVED application back under review would take back —
// read by the confirmation, before the moderator commits to it. Same reading
// as the mutation (`planWithdrawal`). `null`: nothing to take back — the
// application is not, or no longer, approved.
const COLLEAGUES_SHOWN = 5;
const COLLEAGUES_READ_MAX = 60;

export const reopenImpact = query({
  args: { applicationId: v.id('membershipApplications') },
  returns: v.union(
    v.null(),
    v.object({
      // The account the approval made a member (`null`: deleted since), and
      // whether it loses its `membre` role.
      member: v.union(
        v.null(),
        v.object({
          email: v.union(v.string(), v.null()),
          role: networkRole,
          losesRole: v.boolean(),
        }),
      ),
      // The profile that leaves the directory (`null`: none).
      organization: v.union(v.null(), v.object({ name: v.string() })),
      // The OTHER accounts attached to that profile that are members: they
      // keep their role — the first few named, all counted.
      colleagues: v.array(v.union(v.string(), v.null())),
      colleaguesTotal: v.number(),
    }),
  ),
  handler: async (ctx, { applicationId }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application || application.status !== 'approved') return null;
    const plan = await planWithdrawal(ctx, application);

    const colleagues: (string | null)[] = [];
    let colleaguesTotal = 0;
    const org = plan.organization;
    if (org) {
      const links = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_org', (q) => q.eq('orgId', org._id))
        .take(COLLEAGUES_READ_MAX);
      for (const link of links) {
        if (link.userId === plan.member?._id) continue;
        const account = await ctx.db.get(link.userId);
        if (!account || effectiveRole(account.role) !== 'membre') continue;
        colleaguesTotal++;
        if (colleagues.length < COLLEAGUES_SHOWN) {
          colleagues.push(account.email ?? null);
        }
      }
    }

    return {
      member: plan.member
        ? {
            email: plan.member.email ?? null,
            role: effectiveRole(plan.member.role),
            losesRole: plan.withdrawRole,
          }
        : null,
      organization: org ? { name: org.name } : null,
      colleagues,
      colleaguesTotal,
    };
  },
});

// Where the sign-in invitation goes: the address of the account approval
// ELEVATED. Nearly always the contact address — approval creates the account
// from it. But an application submitted while signed in elevates THAT account
// (pentest M-6), and the e-mail says "request a code at this address": sent to
// a contact address that has no account, it pointed at a sign-in that cannot
// succeed, while the account that can sign in was never told.
function invitationRecipient(
  user: Doc<'users'> | null,
  contact: string,
): string {
  return user?.email ? normalizeEmail(user.email) : contact;
}

// Sending the invitation AGAIN (F-01/F-22), from the queue. The first one can
// fail — provider down, a filter, a mailbox full — while the account exists:
// the member was approved and cannot know it. The screen shows whether it went
// out (`invitedAt`); this lets the moderator act on it. Capped per
// application, so that an impatient click does not flood an inbox.
export const INVITATION_RESEND_LIMIT = { max: 3, windowMs: HOUR };

export const resendMembershipInvitation = mutation({
  args: { applicationId: v.id('membershipApplications') },
  returns: v.object({
    email: v.string(),
    // Same signal as account creation: the screen warns when nothing can
    // leave (no provider) instead of announcing a sent e-mail.
    emailMode: v.union(
      v.literal('configured'),
      v.literal('simulated'),
      v.literal('none'),
    ),
  }),
  handler: async (ctx, { applicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');
    // Only an approved application has an account to sign in to.
    if (application.status !== 'approved') {
      throw new Error('INVALID_TRANSITION');
    }

    const contact = normalizeEmail(application.contactEmail);
    const account = await approvedMember(ctx, application);
    // The account was deleted since: "your account is active" would be false.
    if (!account) throw new Error('NOT_FOUND');
    // Nor to a suspended one — the rule of account creation (accounts.ts).
    if (account.suspendedAt !== undefined) throw new Error('MEMBER_SUSPENDED');

    const allowed = await consumeRateLimit(ctx, {
      key: `membershipInvitation:${applicationId}`,
      ...INVITATION_RESEND_LIMIT,
    });
    if (!allowed) throw new Error('RATE_LIMITED');

    const email = invitationRecipient(account, contact);
    await ctx.scheduler.runAfter(
      0,
      internal.organizations.sendMembershipInvitation,
      {
        applicationId,
        email,
        organizationName: application.organizationName,
        locale: application.locale ?? 'fr',
      },
    );
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MEMBERSHIP_INVITATION_RESENT,
      targetId: applicationId,
    });
    return { email, emailMode: emailProviderStatus().mode };
  },
});

// Sending the sign-in invitation (action: network calls are forbidden in a
// mutation). Sets `invitedAt` only if sending succeeded, so that a
// resend remains possible and visible in the back-office.
export const sendMembershipInvitation = internalAction({
  args: {
    applicationId: v.id('membershipApplications'),
    email: v.string(),
    organizationName: v.string(),
    locale,
  },
  handler: async (
    ctx,
    { applicationId, email, organizationName, locale: loc },
  ) => {
    const { subject, html } = invitationEmail({
      organizationName,
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: loc,
    });
    await sendEmail({ to: email, subject, html });
    await ctx.runMutation(internal.organizations.markInvited, {
      applicationId,
    });
  },
});

export const markInvited = internalMutation({
  args: { applicationId: v.id('membershipApplications') },
  handler: async (ctx, { applicationId }) => {
    await ctx.db.patch(applicationId, { invitedAt: Date.now() });
  },
});

// The applicant's two other e-mails, in ACTIONS for the same reason. A failed
// send is logged by the scheduler and not retried: the application itself is
// saved, and the decision stays in force.
export const sendApplicationReceipt = internalAction({
  args: { email: v.string(), locale },
  returns: v.null(),
  handler: async (_ctx, { email, locale: loc }) => {
    const { subject, html } = applicationReceivedEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: loc,
    });
    await sendEmail({ to: email, subject, html });
    return null;
  },
});

export const sendApplicationDecline = internalAction({
  args: { email: v.string(), locale },
  returns: v.null(),
  handler: async (_ctx, { email, locale: loc }) => {
    const { subject, html } = applicationDeclinedEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: loc,
    });
    await sendEmail({ to: email, subject, html });
    return null;
  },
});

// One e-mail per staff member, each in their own language. One failure (a
// full mailbox, a provider hiccup) does not deprive the others of the alert;
// the log counts the failures without adding the addresses.
export const sendStaffApplicationAlert = internalAction({
  args: {
    recipients: v.array(v.object({ email: v.string(), locale })),
    organizationName: v.string(),
    type: applicantType,
    country: v.string(),
    pending: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, { recipients, ...application }) => {
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const failures: string[] = [];
    for (const recipient of recipients) {
      const { subject, html } = staffApplicationAlertEmail({
        ...application,
        siteUrl,
        locale: recipient.locale,
      });
      try {
        await sendEmail({ to: recipient.email, subject, html });
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (failures.length > 0) {
      console.error(
        `Membership application staff alert: ${failures.length}/${recipients.length} not sent (${failures[0]})`,
      );
    }
    return null;
  },
});
