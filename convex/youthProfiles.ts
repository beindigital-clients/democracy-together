import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { getCurrentUser, requireNetworkRole, requireUser } from './lib/rbac';
import { enforceRateLimit } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { FIELD_MAX } from './lib/validation';
import { locale } from './lib/locales';
import {
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_THEMES,
  availabilityValidator,
  cleanVocabulary,
  youthApplicationStatusValidator,
  youthProgrammeValidator,
} from './lib/programmes';

// Youth programme: persistent profile and applications (F-58).
//
// Before: an application = an anonymous form, re-entered every time, with no
// visible follow-up for the young person. Now a signed-in account holds ONE profile
// (background, country, languages, interests, availability, consents) and
// applies to programmes by giving only their motivation; they see the status
// of each application. The anonymous form at /jeunes remains open to anyone
// without an account (self-registration does not exist): it is the front
// door, the profile is the house.

const HOUR = 60 * 60 * 1000;
const APPLY_LIMIT = { max: 10, windowMs: 24 * HOUR };
const PROFILE_LIMIT = { max: 30, windowMs: HOUR };

const profileValidator = v.object({
  _id: v.id('youthProfiles'),
  displayName: v.string(),
  background: v.string(),
  country: v.string(),
  languages: v.array(locale),
  interests: v.array(v.string()),
  availability: availabilityValidator,
  consentProcessing: v.boolean(),
  consentPartnerContact: v.boolean(),
  consentedAt: v.number(),
  updatedAt: v.number(),
});

function projectProfile(p: Doc<'youthProfiles'>) {
  return {
    _id: p._id,
    displayName: p.displayName,
    background: p.background,
    country: p.country,
    languages: p.languages,
    interests: p.interests,
    availability: p.availability,
    consentProcessing: p.consentProcessing,
    consentPartnerContact: p.consentPartnerContact,
    consentedAt: p.consentedAt,
    updatedAt: p.updatedAt,
  };
}

const myApplicationValidator = v.object({
  _id: v.id('youthProgramApplications'),
  programme: youthProgrammeValidator,
  motivation: v.string(),
  status: youthApplicationStatusValidator,
  createdAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
});

// --- Young person's area --------------------------------------------------------

export const myYouthSpace = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      profile: v.union(profileValidator, v.null()),
      applications: v.array(myApplicationValidator),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const profile = await ctx.db
      .query('youthProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    const applications = await ctx.db
      .query('youthProgramApplications')
      .withIndex('by_user_and_programme', (q) => q.eq('userId', user._id))
      .take(50);
    return {
      profile: profile ? projectProfile(profile) : null,
      applications: applications
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((a) => ({
          _id: a._id,
          programme: a.programme,
          motivation: a.motivation,
          status: a.status,
          createdAt: a.createdAt,
          reviewedAt: a.reviewedAt ?? null,
        })),
    };
  },
});

export const saveYouthProfile = mutation({
  args: {
    displayName: v.string(),
    background: v.string(),
    country: v.string(),
    languages: v.array(locale),
    interests: v.array(v.string()),
    availability: availabilityValidator,
    consentProcessing: v.boolean(),
    consentPartnerContact: v.boolean(),
  },
  returns: v.id('youthProfiles'),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const displayName = args.displayName.trim();
    const background = args.background.trim();
    const country = args.country.trim();
    if (displayName.length < 2 || displayName.length > FIELD_MAX.name)
      throw new ConvexError('INVALID_NAME');
    if (background.length > PROGRAMME_LIMITS.background)
      throw new ConvexError('INVALID_BACKGROUND');
    if (country.length < 2 || country.length > FIELD_MAX.country)
      throw new ConvexError('INVALID_COUNTRY');
    const languages = cleanVocabulary(args.languages, PROGRAMME_LANGUAGES);
    if (!languages || languages.length === 0)
      throw new ConvexError('INVALID_LANGUAGES');
    const interests = cleanVocabulary(args.interests, PROGRAMME_THEMES);
    if (!interests) throw new ConvexError('INVALID_INTERESTS');
    // Without consent to processing, we keep nothing: it is the legal
    // basis of the profile, not a decorative checkbox.
    if (!args.consentProcessing) throw new ConvexError('CONSENT_REQUIRED');

    await enforceRateLimit(ctx, {
      key: `youthProfile:${user._id}`,
      ...PROFILE_LIMIT,
    });

    const now = Date.now();
    const existing = await ctx.db
      .query('youthProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    const fields = {
      displayName,
      background,
      country,
      languages: languages as Doc<'youthProfiles'>['languages'],
      interests,
      availability: args.availability,
      consentProcessing: true,
      consentPartnerContact: args.consentPartnerContact,
      updatedAt: now,
    };
    if (existing) {
      // The consent timestamp only moves if the choice changes: it
      // dates the decision, not the latest profile edit.
      const consentChanged =
        existing.consentPartnerContact !== args.consentPartnerContact;
      await ctx.db.patch(existing._id, {
        ...fields,
        ...(consentChanged ? { consentedAt: now } : {}),
      });
      return existing._id;
    }
    return await ctx.db.insert('youthProfiles', {
      userId: user._id,
      ...fields,
      consentedAt: now,
      createdAt: now,
    });
  },
});

// Application attached to the profile. DUPLICATE: one pending or
// accepted application per programme — the second is refused with a code that
// the interface explains ("tu as déjà candidaté"), instead of a queue that
// lists the same person twice. After a rejection or a withdrawal, one can
// apply again.
export const applyToYouthProgramme = mutation({
  args: { programme: youthProgrammeValidator, motivation: v.string() },
  returns: v.id('youthProgramApplications'),
  handler: async (ctx, { programme, motivation }) => {
    const user = await requireUser(ctx);
    const text = motivation.trim();
    if (text.length < 10 || text.length > FIELD_MAX.body)
      throw new ConvexError('INVALID_MOTIVATION');
    const profile = await ctx.db
      .query('youthProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    if (!profile) throw new ConvexError('PROFILE_REQUIRED');

    const previous = await ctx.db
      .query('youthProgramApplications')
      .withIndex('by_user_and_programme', (q) =>
        q.eq('userId', user._id).eq('programme', programme),
      )
      .take(20);
    if (previous.some((a) => a.status === 'pending' || a.status === 'approved'))
      throw new ConvexError('ALREADY_APPLIED');

    await enforceRateLimit(ctx, {
      key: `youthProgramme:${user._id}`,
      ...APPLY_LIMIT,
    });

    return await ctx.db.insert('youthProgramApplications', {
      userId: user._id,
      profileId: profile._id,
      programme,
      motivation: text,
      status: 'pending',
      createdAt: Date.now(),
    });
  },
});

export const withdrawYouthApplication = mutation({
  args: { applicationId: v.id('youthProgramApplications') },
  returns: v.null(),
  handler: async (ctx, { applicationId }) => {
    const user = await requireUser(ctx);
    const application = await ctx.db.get(applicationId);
    // Same response for "nonexistent" and "not yours": the identifier
    // of another application must reveal nothing to whoever guesses it.
    if (!application || application.userId !== user._id)
      throw new ConvexError('NOT_FOUND');
    if (application.status !== 'pending')
      throw new ConvexError('INVALID_TRANSITION');
    await ctx.db.patch(applicationId, { status: 'withdrawn' });
    return null;
  },
});

// --- Back office (moderator and above) ----------------------------------

export const listYouthProfiles = query({
  args: {},
  returns: v.array(
    profileValidator.extend({
      email: v.union(v.string(), v.null()),
      createdAt: v.number(),
      applications: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const profiles = await ctx.db
      .query('youthProfiles')
      .order('desc')
      .take(200);
    const out = [];
    for (const p of profiles) {
      const user = await ctx.db.get(p.userId);
      const applications = await ctx.db
        .query('youthProgramApplications')
        .withIndex('by_user_and_programme', (q) => q.eq('userId', p.userId))
        .take(50);
      out.push({
        ...projectProfile(p),
        email: user?.email ?? null,
        createdAt: p.createdAt,
        applications: applications.length,
      });
    }
    return out;
  },
});

export const listYouthProgramApplications = query({
  args: { status: v.optional(youthApplicationStatusValidator) },
  returns: v.array(
    v.object({
      _id: v.id('youthProgramApplications'),
      programme: youthProgrammeValidator,
      motivation: v.string(),
      status: youthApplicationStatusValidator,
      createdAt: v.number(),
      reviewNotes: v.union(v.string(), v.null()),
      profile: v.union(profileValidator, v.null()),
    }),
  ),
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const rows = status
      ? await ctx.db
          .query('youthProgramApplications')
          .withIndex('by_status', (q) => q.eq('status', status))
          .order('desc')
          .take(200)
      : await ctx.db.query('youthProgramApplications').order('desc').take(200);
    const out = [];
    for (const a of rows) {
      const profile = await ctx.db.get(a.profileId);
      out.push({
        _id: a._id,
        programme: a.programme,
        motivation: a.motivation,
        status: a.status,
        createdAt: a.createdAt,
        reviewNotes: a.reviewNotes ?? null,
        profile: profile ? projectProfile(profile) : null,
      });
    }
    return out;
  },
});

// Review: same machine as the anonymous applications (issue #9) — a
// decision is not reversed by a second click; one reopens, and that is visible.
const PROGRAMME_REVIEW: ReviewMachine<
  Doc<'youthProgramApplications'>['status']
> = {
  transitions: {
    pending: ['approved', 'rejected'],
    approved: ['pending'],
    rejected: ['pending'],
  },
  decided: ['approved', 'rejected', 'withdrawn'],
};

export const reviewYouthProgramApplication = mutation({
  args: {
    applicationId: v.id('youthProgramApplications'),
    decision: v.union(
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('pending'),
    ),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { applicationId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new ConvexError('NOT_FOUND');
    assertTransition(application.status, decision, PROGRAMME_REVIEW);
    const note = notes?.trim().slice(0, FIELD_MAX.body) || undefined;
    await ctx.db.patch(applicationId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      reviewNotes: note,
    });
    if (decision !== 'pending') {
      await notify(ctx, {
        userId: application.userId,
        type: 'youth.program',
        titleKey:
          decision === 'approved'
            ? 'youthProgrammeApproved'
            : 'youthProgrammeRejected',
        link: '/espace-membre/jeunes',
      });
    }
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.YOUTH_PROGRAM_REVIEWED,
      targetId: applicationId,
      metadata: { decision, programme: application.programme },
    });
    return null;
  },
});
