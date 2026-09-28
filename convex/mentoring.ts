import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  getCurrentUser,
  rank,
  requireNetworkRole,
  requireUser,
} from './lib/rbac';
import { enforceRateLimit } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { FIELD_MAX } from './lib/validation';
import { locale } from './lib/locales';
import {
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_REGIONS,
  PROGRAMME_THEMES,
  availabilityValidator,
  cleanVocabulary,
  isPairInactive,
  mentorRoleValidator,
  pairStatusValidator,
  rankMatches,
  scoreMatch,
  type MatchScore,
  type PairStatus,
} from './lib/programmes';

// Mentoring: profiles, suggested matching, pair follow-up (F-59).
//
// The journey, in the order it is lived:
//  1. everyone maintains a PROFILE (mentor or mentee): themes, languages,
//     region, timezone, availability, goals;
//  2. the COORDINATOR (moderator and above) reads, for a mentee, the
//     suggested mentors with an EXPLAINED score (convex/lib/programmes.ts)
//     and confirms a match;
//  3. the pair only exists once ACCEPTED BY BOTH parties — nobody is
//     committed to a mentorship they did not choose;
//  4. the pair is followed up: goals, sessions (notes private to the pair),
//     milestones, status, final review; the coordinator is alerted when no
//     session has been logged for four weeks (daily cron).
//
// Anonymous requests from /jeunes (convex/mentorship.ts) remain the entry
// point for those without an account; this module is the next step, for
// accounts.

const HOUR = 60 * 60 * 1000;
const WRITE_LIMIT = { max: 60, windowMs: HOUR };

// An "ongoing" pair occupies the mentor and the mentee: proposed (slot
// reserved while awaiting answers), active, or paused.
const OPEN_STATUSES: readonly PairStatus[] = ['proposed', 'active', 'paused'];

const reasonValidator = v.any();

async function openPairsForMentor(
  ctx: QueryCtx,
  mentorProfileId: Id<'mentorProfiles'>,
): Promise<number> {
  const pairs = await ctx.db
    .query('mentorPairs')
    .withIndex('by_mentor_profile', (q) =>
      q.eq('mentorProfileId', mentorProfileId),
    )
    .take(100);
  return pairs.filter((p) => OPEN_STATUSES.includes(p.status)).length;
}

async function openPairForMentee(
  ctx: QueryCtx,
  menteeProfileId: Id<'mentorProfiles'>,
): Promise<Doc<'mentorPairs'> | null> {
  const pairs = await ctx.db
    .query('mentorPairs')
    .withIndex('by_mentee_profile', (q) =>
      q.eq('menteeProfileId', menteeProfileId),
    )
    .take(100);
  return pairs.find((p) => OPEN_STATUSES.includes(p.status)) ?? null;
}

function matchInput(p: Doc<'mentorProfiles'>) {
  return {
    themes: p.themes,
    languages: p.languages,
    region: p.region,
    utcOffset: p.utcOffset,
  };
}

async function computeScore(
  ctx: QueryCtx,
  mentee: Doc<'mentorProfiles'>,
  mentor: Doc<'mentorProfiles'>,
): Promise<MatchScore> {
  return scoreMatch(matchInput(mentee), {
    ...matchInput(mentor),
    capacity: mentor.capacity,
    activePairs: await openPairsForMentor(ctx, mentor._id),
  });
}

// Who reads a pair: its two members, and the coordinator. Any other account
// gets NOT_FOUND — the same response as a non-existent identifier.
async function pairAccess(
  ctx: QueryCtx | MutationCtx,
  pairId: Id<'mentorPairs'>,
): Promise<{
  user: Doc<'users'>;
  pair: Doc<'mentorPairs'>;
  side: 'mentor' | 'mentore' | null;
  coordinator: boolean;
}> {
  const user = await requireUser(ctx);
  const pair = await ctx.db.get(pairId);
  if (!pair) throw new ConvexError('NOT_FOUND');
  const side =
    pair.mentorUserId === user._id
      ? 'mentor'
      : pair.menteeUserId === user._id
        ? 'mentore'
        : null;
  const coordinator = rank(user.role) >= rank('moderateur');
  if (!side && !coordinator) throw new ConvexError('NOT_FOUND');
  return { user, pair, side, coordinator };
}

async function requireMember(
  ctx: MutationCtx,
  pairId: Id<'mentorPairs'>,
): Promise<{
  user: Doc<'users'>;
  pair: Doc<'mentorPairs'>;
  side: 'mentor' | 'mentore';
}> {
  const access = await pairAccess(ctx, pairId);
  // The coordinator FOLLOWS the pair, they do not run it: sessions, milestones,
  // goals and review are written by its two members.
  if (!access.side) throw new ConvexError('NOT_FOUND');
  await enforceRateLimit(ctx, {
    key: `mentoring:${access.user._id}`,
    ...WRITE_LIMIT,
  });
  return { user: access.user, pair: access.pair, side: access.side };
}

const profileValidator = v.object({
  _id: v.id('mentorProfiles'),
  role: mentorRoleValidator,
  displayName: v.string(),
  themes: v.array(v.string()),
  languages: v.array(locale),
  region: v.string(),
  utcOffset: v.union(v.number(), v.null()),
  availability: availabilityValidator,
  goals: v.string(),
  capacity: v.number(),
  active: v.boolean(),
});

function projectProfile(p: Doc<'mentorProfiles'>) {
  return {
    _id: p._id,
    role: p.role,
    displayName: p.displayName,
    themes: p.themes,
    languages: p.languages,
    region: p.region,
    utcOffset: p.utcOffset ?? null,
    availability: p.availability,
    goals: p.goals,
    capacity: p.capacity,
    active: p.active,
  };
}

const pairSummaryValidator = v.object({
  _id: v.id('mentorPairs'),
  status: pairStatusValidator,
  side: v.union(v.literal('mentor'), v.literal('mentore')),
  counterpartName: v.string(),
  myAcceptance: v.boolean(),
  otherAcceptance: v.boolean(),
  score: v.number(),
  proposedAt: v.number(),
  startedAt: v.union(v.number(), v.null()),
  lastSessionAt: v.union(v.number(), v.null()),
});

// --- Member area ------------------------------------------------------------

export const myMentoring = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      profiles: v.array(profileValidator),
      pairs: v.array(pairSummaryValidator),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const profiles = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(2);
    const asMentor = await ctx.db
      .query('mentorPairs')
      .withIndex('by_mentor_user', (q) => q.eq('mentorUserId', user._id))
      .take(50);
    const asMentee = await ctx.db
      .query('mentorPairs')
      .withIndex('by_mentee_user', (q) => q.eq('menteeUserId', user._id))
      .take(50);
    const pairs = [];
    for (const [side, list] of [
      ['mentor', asMentor],
      ['mentore', asMentee],
    ] as const) {
      for (const p of list) {
        const other = await ctx.db.get(
          side === 'mentor' ? p.menteeProfileId : p.mentorProfileId,
        );
        pairs.push({
          _id: p._id,
          status: p.status,
          side,
          counterpartName: other?.displayName ?? '—',
          myAcceptance: side === 'mentor' ? p.mentorAccepted : p.menteeAccepted,
          otherAcceptance:
            side === 'mentor' ? p.menteeAccepted : p.mentorAccepted,
          score: p.score,
          proposedAt: p.proposedAt,
          startedAt: p.startedAt ?? null,
          lastSessionAt: p.lastSessionAt ?? null,
        });
      }
    }
    return {
      profiles: profiles.map(projectProfile),
      pairs: pairs.sort((a, b) => b.proposedAt - a.proposedAt),
    };
  },
});

export const saveMentorProfile = mutation({
  args: {
    role: mentorRoleValidator,
    displayName: v.string(),
    themes: v.array(v.string()),
    languages: v.array(locale),
    region: v.string(),
    utcOffset: v.optional(v.number()),
    availability: availabilityValidator,
    goals: v.string(),
    capacity: v.optional(v.number()),
    active: v.boolean(),
  },
  returns: v.id('mentorProfiles'),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Mentoring commits the network: reserved for validated members. Being
    // mentored is open to any account.
    if (args.role === 'mentor' && rank(user.role) < rank('membre'))
      throw new ConvexError('MEMBER_REQUIRED');
    const displayName = args.displayName.trim();
    const goals = args.goals.trim();
    if (displayName.length < 2 || displayName.length > FIELD_MAX.name)
      throw new ConvexError('INVALID_NAME');
    if (goals.length < 10 || goals.length > PROGRAMME_LIMITS.goals)
      throw new ConvexError('INVALID_GOALS');
    const themes = cleanVocabulary(args.themes, PROGRAMME_THEMES);
    if (!themes || themes.length === 0) throw new ConvexError('INVALID_THEMES');
    const languages = cleanVocabulary(args.languages, PROGRAMME_LANGUAGES);
    if (!languages || languages.length === 0)
      throw new ConvexError('INVALID_LANGUAGES');
    if (!(PROGRAMME_REGIONS as readonly string[]).includes(args.region))
      throw new ConvexError('INVALID_REGION');
    if (
      args.utcOffset !== undefined &&
      (!Number.isFinite(args.utcOffset) ||
        args.utcOffset < -12 ||
        args.utcOffset > 14)
    )
      throw new ConvexError('INVALID_OFFSET');
    const capacity =
      args.role === 'mentor' ? Math.round(args.capacity ?? 2) : 1;
    if (capacity < 1 || capacity > PROGRAMME_LIMITS.maxMentorCapacity)
      throw new ConvexError('INVALID_CAPACITY');

    await enforceRateLimit(ctx, {
      key: `mentoring:${user._id}`,
      ...WRITE_LIMIT,
    });

    const now = Date.now();
    const fields = {
      displayName,
      themes,
      languages: languages as Doc<'mentorProfiles'>['languages'],
      region: args.region,
      utcOffset: args.utcOffset,
      availability: args.availability,
      goals,
      capacity,
      active: args.active,
      updatedAt: now,
    };
    const mine = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(2);
    const existing = mine.find((p) => p.role === args.role);
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert('mentorProfiles', {
      userId: user._id,
      role: args.role,
      ...fields,
      createdAt: now,
    });
  },
});

export const respondToPair = mutation({
  args: { pairId: v.id('mentorPairs'), accept: v.boolean() },
  returns: pairStatusValidator,
  handler: async (ctx, { pairId, accept }) => {
    const { pair, side } = await requireMember(ctx, pairId);
    if (pair.status !== 'proposed') throw new ConvexError('INVALID_TRANSITION');
    const now = Date.now();
    if (!accept) {
      await ctx.db.patch(pairId, { status: 'declined', endedAt: now });
      if (pair.proposedBy) {
        await notify(ctx, {
          userId: pair.proposedBy,
          type: 'mentoring.declined',
          titleKey: 'mentoringDeclined',
          link: '/admin/mentorat/coordination',
        });
      }
      return 'declined';
    }
    const mentorAccepted = side === 'mentor' ? true : pair.mentorAccepted;
    const menteeAccepted = side === 'mentore' ? true : pair.menteeAccepted;
    const active = mentorAccepted && menteeAccepted;
    await ctx.db.patch(pairId, {
      mentorAccepted,
      menteeAccepted,
      ...(active ? { status: 'active' as const, startedAt: now } : {}),
    });
    if (active) {
      for (const userId of [pair.mentorUserId, pair.menteeUserId]) {
        await notify(ctx, {
          userId,
          type: 'mentoring.active',
          titleKey: 'mentoringActive',
          link: `/espace-membre/mentorat/${pairId}`,
        });
      }
    }
    return active ? 'active' : 'proposed';
  },
});

const sessionValidator = v.object({
  _id: v.id('mentorSessions'),
  date: v.number(),
  durationMinutes: v.number(),
  // `null` for the coordinator: the notes are private to the pair.
  notes: v.union(v.string(), v.null()),
});

const milestoneValidator = v.object({
  _id: v.id('mentorMilestones'),
  title: v.string(),
  dueDate: v.union(v.number(), v.null()),
  doneAt: v.union(v.number(), v.null()),
});

export const getPair = query({
  args: { pairId: v.id('mentorPairs') },
  returns: v.object({
    _id: v.id('mentorPairs'),
    viewer: v.union(
      v.literal('mentor'),
      v.literal('mentore'),
      v.literal('coordinator'),
    ),
    status: pairStatusValidator,
    mentorName: v.string(),
    menteeName: v.string(),
    // The other person's address is only given to members of an ACCEPTED pair:
    // acceptance is what constitutes consent to be contacted.
    counterpartEmail: v.union(v.string(), v.null()),
    mentorAccepted: v.boolean(),
    menteeAccepted: v.boolean(),
    score: v.number(),
    scoreReasons: reasonValidator,
    goals: v.union(v.string(), v.null()),
    proposedAt: v.number(),
    startedAt: v.union(v.number(), v.null()),
    endedAt: v.union(v.number(), v.null()),
    lastSessionAt: v.union(v.number(), v.null()),
    mentorReview: v.union(v.string(), v.null()),
    menteeReview: v.union(v.string(), v.null()),
    sessions: v.array(sessionValidator),
    milestones: v.array(milestoneValidator),
  }),
  handler: async (ctx, { pairId }) => {
    const { pair, side } = await pairAccess(ctx, pairId);
    const mentor = await ctx.db.get(pair.mentorProfileId);
    const mentee = await ctx.db.get(pair.menteeProfileId);
    let counterpartEmail: string | null = null;
    if (side && pair.status !== 'proposed' && pair.status !== 'declined') {
      const other = await ctx.db.get(
        side === 'mentor' ? pair.menteeUserId : pair.mentorUserId,
      );
      counterpartEmail = other?.email ?? null;
    }
    const sessions = await ctx.db
      .query('mentorSessions')
      .withIndex('by_pair_and_date', (q) => q.eq('pairId', pairId))
      .order('desc')
      .take(200);
    const milestones = await ctx.db
      .query('mentorMilestones')
      .withIndex('by_pair', (q) => q.eq('pairId', pairId))
      .take(100);
    return {
      _id: pair._id,
      viewer: side ?? ('coordinator' as const),
      status: pair.status,
      mentorName: mentor?.displayName ?? '—',
      menteeName: mentee?.displayName ?? '—',
      counterpartEmail,
      mentorAccepted: pair.mentorAccepted,
      menteeAccepted: pair.menteeAccepted,
      score: pair.score,
      scoreReasons: pair.scoreReasons,
      goals: pair.goals ?? null,
      proposedAt: pair.proposedAt,
      startedAt: pair.startedAt ?? null,
      endedAt: pair.endedAt ?? null,
      lastSessionAt: pair.lastSessionAt ?? null,
      mentorReview: pair.mentorReview ?? null,
      menteeReview: pair.menteeReview ?? null,
      sessions: sessions.map((s) => ({
        _id: s._id,
        date: s.date,
        durationMinutes: s.durationMinutes,
        notes: side ? (s.notes ?? '') : null,
      })),
      milestones: milestones
        .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
        .map((m) => ({
          _id: m._id,
          title: m.title,
          dueDate: m.dueDate ?? null,
          doneAt: m.doneAt ?? null,
        })),
    };
  },
});

export const updatePairGoals = mutation({
  args: { pairId: v.id('mentorPairs'), goals: v.string() },
  returns: v.null(),
  handler: async (ctx, { pairId, goals }) => {
    const { pair } = await requireMember(ctx, pairId);
    if (pair.status === 'declined' || pair.status === 'ended')
      throw new ConvexError('PAIR_CLOSED');
    const text = goals.trim();
    if (text.length > PROGRAMME_LIMITS.goals)
      throw new ConvexError('INVALID_GOALS');
    await ctx.db.patch(pairId, { goals: text || undefined });
    return null;
  },
});

export const logSession = mutation({
  args: {
    pairId: v.id('mentorPairs'),
    date: v.number(),
    durationMinutes: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.id('mentorSessions'),
  handler: async (ctx, { pairId, date, durationMinutes, notes }) => {
    const { user, pair } = await requireMember(ctx, pairId);
    // We log what took place: during the pair, not before its start nor in the
    // future (one hour of slack for timezones).
    if (pair.status !== 'active' && pair.status !== 'paused')
      throw new ConvexError('PAIR_NOT_ACTIVE');
    const now = Date.now();
    if (
      !Number.isFinite(date) ||
      date > now + HOUR ||
      (pair.startedAt !== undefined && date < pair.startedAt - 24 * HOUR)
    )
      throw new ConvexError('INVALID_DATE');
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 5 ||
      durationMinutes > PROGRAMME_LIMITS.maxSessionMinutes
    )
      throw new ConvexError('INVALID_DURATION');
    const text = notes?.trim() ?? '';
    if (text.length > PROGRAMME_LIMITS.sessionNotes)
      throw new ConvexError('INVALID_NOTES');
    const id = await ctx.db.insert('mentorSessions', {
      pairId,
      date,
      durationMinutes,
      notes: text || undefined,
      loggedBy: user._id,
      createdAt: now,
    });
    if (pair.lastSessionAt === undefined || date > pair.lastSessionAt) {
      await ctx.db.patch(pairId, { lastSessionAt: date });
    }
    return id;
  },
});

export const addMilestone = mutation({
  args: {
    pairId: v.id('mentorPairs'),
    title: v.string(),
    dueDate: v.optional(v.number()),
  },
  returns: v.id('mentorMilestones'),
  handler: async (ctx, { pairId, title, dueDate }) => {
    const { user, pair } = await requireMember(ctx, pairId);
    if (pair.status === 'declined' || pair.status === 'ended')
      throw new ConvexError('PAIR_CLOSED');
    const text = title.trim();
    if (text.length < 3 || text.length > PROGRAMME_LIMITS.shortText)
      throw new ConvexError('INVALID_TITLE');
    const existing = await ctx.db
      .query('mentorMilestones')
      .withIndex('by_pair', (q) => q.eq('pairId', pairId))
      .take(100);
    if (existing.length >= 50) throw new ConvexError('TOO_MANY_MILESTONES');
    return await ctx.db.insert('mentorMilestones', {
      pairId,
      title: text,
      dueDate,
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

export const setMilestoneDone = mutation({
  args: { milestoneId: v.id('mentorMilestones'), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { milestoneId, done }) => {
    const milestone = await ctx.db.get(milestoneId);
    if (!milestone) throw new ConvexError('NOT_FOUND');
    await requireMember(ctx, milestone.pairId);
    await ctx.db.patch(milestoneId, { doneAt: done ? Date.now() : undefined });
    return null;
  },
});

// Pair status: its members AND the coordinator can pause, resume or end it.
// "Ended" is final: a pair is not resurrected, a new one is proposed.
const STATUS_TRANSITIONS: Partial<Record<PairStatus, readonly PairStatus[]>> = {
  active: ['paused', 'ended'],
  paused: ['active', 'ended'],
};

export const setPairStatus = mutation({
  args: {
    pairId: v.id('mentorPairs'),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('ended'),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { pairId, status }) => {
    const { user, pair } = await pairAccess(ctx, pairId);
    if (!(STATUS_TRANSITIONS[pair.status] ?? []).includes(status))
      throw new ConvexError('INVALID_TRANSITION');
    await ctx.db.patch(pairId, {
      status,
      ...(status === 'ended' ? { endedAt: Date.now() } : {}),
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.MENTORING_PAIR_STATUS,
      targetId: pairId,
      metadata: { from: pair.status, to: status },
    });
    return null;
  },
});

export const submitFinalReview = mutation({
  args: { pairId: v.id('mentorPairs'), review: v.string() },
  returns: v.null(),
  handler: async (ctx, { pairId, review }) => {
    const { pair, side } = await requireMember(ctx, pairId);
    if (pair.status !== 'ended') throw new ConvexError('PAIR_NOT_ENDED');
    const text = review.trim();
    if (text.length < 10 || text.length > PROGRAMME_LIMITS.review)
      throw new ConvexError('INVALID_REVIEW');
    await ctx.db.patch(
      pairId,
      side === 'mentor' ? { mentorReview: text } : { menteeReview: text },
    );
    return null;
  },
});

// --- Coordination (moderator and above) -------------------------------------

const suggestionValidator = v.object({
  mentorProfileId: v.id('mentorProfiles'),
  displayName: v.string(),
  score: v.number(),
  reasons: reasonValidator,
});

export const coordinationOverview = query({
  // `now` comes from the client: a query does not read the clock (it would not
  // be re-evaluated as time passes). The screen refreshes it every minute.
  args: { now: v.number() },
  returns: v.object({
    unmatchedMentees: v.array(profileValidator),
    mentors: v.array(profileValidator.extend({ openPairs: v.number() })),
    pairs: v.array(
      v.object({
        _id: v.id('mentorPairs'),
        status: pairStatusValidator,
        mentorName: v.string(),
        menteeName: v.string(),
        mentorAccepted: v.boolean(),
        menteeAccepted: v.boolean(),
        score: v.number(),
        proposedAt: v.number(),
        lastSessionAt: v.union(v.number(), v.null()),
        inactive: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, { now }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const mentees = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_role_and_active', (q) =>
        q.eq('role', 'mentore').eq('active', true),
      )
      .take(200);
    const unmatchedMentees = [];
    for (const m of mentees) {
      if (!(await openPairForMentee(ctx, m._id)))
        unmatchedMentees.push(projectProfile(m));
    }
    const mentorDocs = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_role_and_active', (q) =>
        q.eq('role', 'mentor').eq('active', true),
      )
      .take(200);
    const mentors = [];
    for (const m of mentorDocs) {
      mentors.push({
        ...projectProfile(m),
        openPairs: await openPairsForMentor(ctx, m._id),
      });
    }
    const pairDocs = await ctx.db.query('mentorPairs').order('desc').take(200);
    const pairs = [];
    for (const p of pairDocs) {
      const mentor = await ctx.db.get(p.mentorProfileId);
      const mentee = await ctx.db.get(p.menteeProfileId);
      pairs.push({
        _id: p._id,
        status: p.status,
        mentorName: mentor?.displayName ?? '—',
        menteeName: mentee?.displayName ?? '—',
        mentorAccepted: p.mentorAccepted,
        menteeAccepted: p.menteeAccepted,
        score: p.score,
        proposedAt: p.proposedAt,
        lastSessionAt: p.lastSessionAt ?? null,
        // Same rule as the cron, without the alert memory: the screen shows the
        // state, the cron decides whether to notify.
        inactive: isPairInactive({ ...p, inactivityAlertAt: undefined }, now),
      });
    }
    return { unmatchedMentees, mentors, pairs };
  },
});

export const suggestMentors = query({
  args: { menteeProfileId: v.id('mentorProfiles') },
  returns: v.array(suggestionValidator),
  handler: async (ctx, { menteeProfileId }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const mentee = await ctx.db.get(menteeProfileId);
    if (!mentee || mentee.role !== 'mentore')
      throw new ConvexError('NOT_FOUND');
    const mentors = await ctx.db
      .query('mentorProfiles')
      .withIndex('by_role_and_active', (q) =>
        q.eq('role', 'mentor').eq('active', true),
      )
      .take(200);
    const scored = [];
    for (const mentor of mentors) {
      // One does not mentor oneself.
      if (mentor.userId === mentee.userId) continue;
      scored.push({
        id: mentor._id as string,
        mentor,
        score: await computeScore(ctx, mentee, mentor),
      });
    }
    return rankMatches(scored).map((s) => ({
      mentorProfileId: s.mentor._id,
      displayName: s.mentor.displayName,
      score: s.score.score,
      reasons: s.score.reasons,
    }));
  },
});

export const proposePair = mutation({
  args: {
    menteeProfileId: v.id('mentorProfiles'),
    mentorProfileId: v.id('mentorProfiles'),
  },
  returns: v.id('mentorPairs'),
  handler: async (ctx, { menteeProfileId, mentorProfileId }) => {
    const coordinator = await requireNetworkRole(ctx, 'moderateur');
    const mentee = await ctx.db.get(menteeProfileId);
    const mentor = await ctx.db.get(mentorProfileId);
    if (!mentee || mentee.role !== 'mentore' || !mentee.active)
      throw new ConvexError('NOT_FOUND');
    if (!mentor || mentor.role !== 'mentor' || !mentor.active)
      throw new ConvexError('NOT_FOUND');
    if (mentor.userId === mentee.userId) throw new ConvexError('SAME_PERSON');
    if (await openPairForMentee(ctx, menteeProfileId))
      throw new ConvexError('ALREADY_PAIRED');
    // The score is RECOMPUTED here, never received from the client: what is
    // frozen on the pair is what the server observed at decision time.
    const score = await computeScore(ctx, mentee, mentor);
    if (!score.eligible) throw new ConvexError('MENTOR_FULL');

    const pairId = await ctx.db.insert('mentorPairs', {
      mentorProfileId,
      menteeProfileId,
      mentorUserId: mentor.userId,
      menteeUserId: mentee.userId,
      status: 'proposed',
      mentorAccepted: false,
      menteeAccepted: false,
      score: score.score,
      scoreReasons: score.reasons,
      proposedBy: coordinator._id,
      proposedAt: Date.now(),
    });
    for (const userId of [mentor.userId, mentee.userId]) {
      await notify(ctx, {
        userId,
        type: 'mentoring.proposed',
        titleKey: 'mentoringProposed',
        link: `/espace-membre/mentorat/${pairId}`,
      });
    }
    await recordAudit(ctx, {
      actorId: coordinator._id,
      action: AUDIT.MENTORING_PAIR_PROPOSED,
      targetId: pairId,
      metadata: { score: score.score },
    });
    return pairId;
  },
});

// --- Inactivity alert (daily cron, convex/crons.ts) -------------------------
export const checkInactivity = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query('mentorPairs')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .take(500);
    let alerted = 0;
    for (const pair of active) {
      if (!isPairInactive(pair, now)) continue;
      await ctx.db.patch(pair._id, { inactivityAlertAt: now });
      // The coordinator who confirmed the pair is notified; if they no longer
      // exist, the administrators are — an alert with no recipient alerts nobody.
      const recipients: Id<'users'>[] = [];
      if (pair.proposedBy && (await ctx.db.get(pair.proposedBy))) {
        recipients.push(pair.proposedBy);
      } else {
        const admins = await ctx.db
          .query('users')
          .withIndex('by_role', (q) => q.eq('role', 'admin'))
          .take(10);
        recipients.push(...admins.map((a) => a._id));
      }
      const mentee = await ctx.db.get(pair.menteeProfileId);
      for (const userId of recipients) {
        await notify(ctx, {
          userId,
          type: 'mentoring.inactive',
          titleKey: 'mentoringInactive',
          params: { name: mentee?.displayName ?? '—' },
          link: `/espace-membre/mentorat/${pair._id}`,
        });
      }
      alerted++;
    }
    return alerted;
  },
});
