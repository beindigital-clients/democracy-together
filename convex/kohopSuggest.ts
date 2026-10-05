import { v, ConvexError } from 'convex/values';
import { mutation } from './_generated/server';
import { requireOwnContribution, recordKohopEvent } from './lib/kohopAccess';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { enforceRateLimit } from './lib/rateLimit';
import { displayedOrganization } from './lib/socialAccess';
import { KOHOP_ACTIVE_REVIEWER_STATUSES, levelOf } from './lib/kohop';
import { collectLinkFacts } from './lib/kohopLinkFacts';
import { evaluateLinks, linkLevel } from './lib/kohopLinks';
import { scoreCandidate, topCandidates } from './lib/kohopSuggest';
import { EDITABLE } from './kohop';

// KOHOP — suggestions of reviewers for the AUTHOR (K-20). The platform proposes
// five directory members; the author designates, through the usual door
// (`proposeReviewer`), which applies the same server rules. A candidate with a
// BLOCKING link is left out silently; what a flagged link says stays in the
// stored history for the review chief and never reaches the author.

const HOUR = 60 * 60 * 1000;
const SCAN = 150;

const OPEN_STAGES = ['submitted', 'in_review', 'revision'] as const;

export const suggestReviewers = mutation({
  args: { contributionId: v.id('kohopContributions') },
  handler: async (ctx, { contributionId }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    if (
      !EDITABLE.includes(contribution.stage) &&
      !(OPEN_STAGES as readonly string[]).includes(contribution.stage)
    ) {
      throw new ConvexError('NOT_EDITABLE');
    }
    await enforceRateLimit(ctx, {
      key: `kohop:suggest:${user._id}`,
      max: 20,
      windowMs: HOUR,
    });

    const already = new Set(
      (
        await ctx.db
          .query('kohopReviewers')
          .withIndex('by_contribution', (q) =>
            q.eq('contributionId', contribution._id),
          )
          .take(30)
      )
        .filter((r) => KOHOP_ACTIVE_REVIEWER_STATUSES.includes(r.status))
        .map((r) => r.userId),
    );

    const profiles = await ctx.db
      .query('memberProfiles')
      .withIndex('by_listed_and_nameKey', (q) => q.eq('listed', true))
      .take(SCAN);

    const scored = [];
    for (const p of profiles) {
      if (p.userId === user._id || p.notReviewer === true) continue;
      if (already.has(p.userId)) continue;
      const { score, reasons } = scoreCandidate(
        {
          fields: contribution.fields,
          keywords: contribution.keywords,
          lang: contribution.lang,
        },
        { themes: p.themes, languages: p.languages, searchText: p.searchText },
      );
      if (score === 0) continue;
      const account = await ctx.db.get(p.userId);
      if (
        !account ||
        account.suspendedAt !== undefined ||
        (account.role !== 'membre' &&
          account.role !== 'moderateur' &&
          account.role !== 'editeur' &&
          account.role !== 'admin')
      ) {
        continue;
      }
      scored.push({ profile: p, account, score, reasons, name: p.displayName });
    }

    const kept = [];
    for (const c of topCandidates(scored, 12)) {
      const facts = await collectLinkFacts(ctx, {
        contribution,
        candidate: {
          userId: c.profile.userId,
          email: c.account.email,
          name: c.profile.displayName,
        },
        declaredRelationship: 'none',
      });
      // A blocking link: the candidate would be refused at designation.
      if (linkLevel(facts) === 'blocking') continue;
      kept.push({ ...c, findings: evaluateLinks(facts) });
      if (kept.length >= 5) break;
    }

    const now = Date.now();
    await ctx.db.insert('kohopSuggestions', {
      contributionId: contribution._id,
      candidates: kept.map((c) => ({
        userId: c.profile.userId,
        name: c.profile.displayName,
        reasons: c.reasons,
        level: levelOf(c.findings),
        findings: c.findings.map((f) => ({
          type: f.type,
          detail: f.detail,
          source: f.source,
        })),
      })),
      createdAt: now,
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_SUGGESTED,
      targetId: contribution._id,
      metadata: { count: kept.length },
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'link_checked',
      actorId: user._id,
      metadata: { suggestions: kept.length },
    });

    // What the author gets: who, why — never the links.
    const out = [];
    for (const c of kept) {
      out.push({
        userId: c.profile.userId,
        handle: c.profile.handle,
        displayName: c.profile.displayName,
        jobTitle: c.profile.jobTitle ?? null,
        country: c.profile.country ?? null,
        organization:
          (await displayedOrganization(ctx, c.profile.userId))?.name ?? null,
        reasons: c.reasons,
      });
    }
    return out;
  },
});
