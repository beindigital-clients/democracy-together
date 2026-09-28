import { ConvexError, v } from 'convex/values';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { locale } from './lib/locales';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole, getActiveUserId, rank } from './lib/rbac';
import { recordAudit } from './lib/audit';
import {
  COUNTER,
  bumpCounter,
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
import { isEmail, FIELD_MAX } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { slugify } from './lib/slug';
import { organizationSearchText } from './lib/searchText';
import { sendEmail } from './email';
import {
  normalizeEmail,
  validateDirectoryFields,
  invitationEmail,
} from './lib/onboarding';

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
    // O3 / R-09). The pending applications queue is short by
    // construction (it is emptied by hand, by a moderator): reading it through
    // the `by_status` index stays bounded, with no extra index on
    // the address. The comparison is normalized the way approval will do it
    // (`normalizeEmail`): "Contact@X.org" and "contact@x.org" are the
    // same person. `ConvexError`: `data` travels through the action to the
    // form, which can say "an application is already in progress".
    const wanted = normalizeEmail(contactEmail);
    const pending = await ctx.db
      .query('membershipApplications')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(PENDING_APPLICATIONS_MAX);
    if (pending.some((a) => normalizeEmail(a.contactEmail) === wanted)) {
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
    return applicationId;
  },
});

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
    // replayed. Without this, re-approving created duplicate accounts and profiles, and
    // "rejecting" after approval left the granted role in place.
    if (application.status !== 'pending') throw new Error('ALREADY_REVIEWED');

    const now = Date.now();
    await ctx.db.patch(applicationId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewNotes: notes,
      reviewedAt: now,
    });
    await trackMembershipApplicationStatus(ctx, application.status, decision);

    if (decision === 'rejected') {
      if (application.applicantUserId) {
        await notify(ctx, {
          userId: application.applicantUserId,
          type: 'membership_rejected',
          titleKey: 'membershipRejected',
          link: '/adhesion',
        });
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
    const linked = application.applicantUserId
      ? await ctx.db.get(application.applicantUserId)
      : null;
    const byEmail = linked
      ? null
      : await ctx.db
          .query('users')
          .withIndex('email', (q) => q.eq('email', email))
          .first();

    let user = linked ?? byEmail;
    let userCreated = false;
    if (!user) {
      const id = await ctx.db.insert('users', { email, role: 'membre' });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      user = (await ctx.db.get(id))!;
      userCreated = true;
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.USER_INVITED,
        targetId: id,
        metadata: { via: 'membership', email },
      });
    } else if (rank(user.role) < rank('membre')) {
      // We NEVER overwrite a higher role.
      await ctx.db.patch(user._id, { role: 'membre' });
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.USER_ROLE_CHANGED,
        targetId: user._id,
        metadata: { role: 'membre', via: 'membership' },
      });
    }

    // --- 2) The ORGANIZATION and 3) the LINK ---------------------------------
    let organizationId: Id<'organizations'> | null = null;
    if (application.type === 'organisation') {
      const fields = directory ? validateDirectoryFields(directory) : null;
      if (fields && !fields.ok) throw new Error(fields.reason);
      const d = fields && fields.ok ? fields.value : null;

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

      organizationId = await ctx.db.insert('organizations', {
        name: application.organizationName,
        slug,
        // Without directory fields, the profile stays 'pending': better a
        // profile to be completed than a false public profile.
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
        userId: user._id,
        orgId: organizationId,
        orgRole: 'owner',
        createdAt: now,
      });
      await ctx.db.patch(applicationId, { createdOrgId: organizationId });
      await recordAudit(ctx, {
        actorId: reviewer._id,
        action: AUDIT.ORGANIZATION_CREATED,
        targetId: organizationId,
        metadata: { slug, status: d ? 'active' : 'pending' },
      });
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
      metadata: { decision },
    });

    // The email goes out in a scheduled ACTION (never fetch in a mutation).
    // Its failure does not undo the approval: the account already exists, and
    // the invitation can be resent from the back-office.
    await ctx.scheduler.runAfter(
      0,
      internal.organizations.sendMembershipInvitation,
      {
        applicationId,
        email,
        organizationName: application.organizationName,
        // Language recorded when the application was submitted. Missing on
        // applications predating this field: the fallback stays French.
        locale: application.locale ?? 'fr',
      },
    );

    return { userCreated, organizationId };
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
