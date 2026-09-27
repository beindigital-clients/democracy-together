import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// Chantier « programmes » (F-56 à F-60) : données personnelles d'un compte —
// export (droit d'accès) et suppression (droit à l'effacement). Fonctions
// INTERNES, sans `ctx.auth` : c'est la suppression de compte qui les appelle,
// après avoir elle-même établi qui supprime quoi.

async function pairsOf(ctx: QueryCtx, userId: Id<'users'>) {
  const asMentor = await ctx.db
    .query('mentorPairs')
    .withIndex('by_mentor_user', (q) => q.eq('mentorUserId', userId))
    .collect();
  const asMentee = await ctx.db
    .query('mentorPairs')
    .withIndex('by_mentee_user', (q) => q.eq('menteeUserId', userId))
    .collect();
  return [...asMentor, ...asMentee];
}

async function applicationsOf(ctx: QueryCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('projectCallApplications')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
}

export async function exportUserDataProgrammes(
  ctx: QueryCtx,
  userId: Id<'users'>,
) {
  const youthProfile = await ctx.db
    .query('youthProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const youthApplications = await ctx.db
    .query('youthProgramApplications')
    .withIndex('by_user_and_programme', (q) => q.eq('userId', userId))
    .collect();
  const mentorProfiles = await ctx.db
    .query('mentorProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  const pairs = [];
  for (const p of await pairsOf(ctx, userId)) {
    const sessions = await ctx.db
      .query('mentorSessions')
      .withIndex('by_pair_and_date', (q) => q.eq('pairId', p._id))
      .collect();
    const milestones = await ctx.db
      .query('mentorMilestones')
      .withIndex('by_pair', (q) => q.eq('pairId', p._id))
      .collect();
    pairs.push({
      role: p.mentorUserId === userId ? 'mentor' : 'mentore',
      status: p.status,
      proposedAt: p.proposedAt,
      startedAt: p.startedAt ?? null,
      endedAt: p.endedAt ?? null,
      goals: p.goals ?? null,
      myReview:
        (p.mentorUserId === userId ? p.mentorReview : p.menteeReview) ?? null,
      sessions: sessions.map((s) => ({
        date: s.date,
        durationMinutes: s.durationMinutes,
        notes: s.notes ?? null,
      })),
      milestones: milestones.map((m) => ({
        title: m.title,
        dueDate: m.dueDate ?? null,
        doneAt: m.doneAt ?? null,
      })),
    });
  }
  const callApplications = [];
  for (const a of await applicationsOf(ctx, userId)) {
    const call = await ctx.db.get(a.callId);
    const attachments = await ctx.db
      .query('projectCallAttachments')
      .withIndex('by_application', (q) => q.eq('applicationId', a._id))
      .collect();
    callApplications.push({
      call: call?.title ?? null,
      title: a.title,
      summary: a.summary,
      language: a.language,
      status: a.status,
      submittedAt: a.submittedAt ?? null,
      decisionNote: a.decisionNote ?? null,
      attachments: attachments.map((x) => x.fileName),
    });
  }
  const evaluations = await ctx.db
    .query('projectEvaluations')
    .withIndex('by_evaluator', (q) => q.eq('evaluatorId', userId))
    .collect();
  const enrollments = await ctx.db
    .query('learningEnrollments')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  const learning = [];
  for (const e of enrollments) {
    const path = await ctx.db.get(e.pathId);
    const done = await ctx.db
      .query('learningProgress')
      .withIndex('by_enrollment', (q) => q.eq('enrollmentId', e._id))
      .collect();
    learning.push({
      path: path?.title ?? null,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt ?? null,
      certificateCode: e.certificateCode ?? null,
      stepsDone: done.length,
    });
  }
  return {
    youthProfile: youthProfile
      ? {
          displayName: youthProfile.displayName,
          background: youthProfile.background,
          country: youthProfile.country,
          languages: youthProfile.languages,
          interests: youthProfile.interests,
          availability: youthProfile.availability,
          consentProcessing: youthProfile.consentProcessing,
          consentPartnerContact: youthProfile.consentPartnerContact,
          consentedAt: youthProfile.consentedAt,
        }
      : null,
    youthApplications: youthApplications.map((a) => ({
      programme: a.programme,
      motivation: a.motivation,
      status: a.status,
      createdAt: a.createdAt,
    })),
    mentorProfiles: mentorProfiles.map((p) => ({
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
    })),
    mentorPairs: pairs,
    projectCallApplications: callApplications,
    projectEvaluations: evaluations.map((e) => ({
      conflict: e.conflict,
      scores: e.scores,
      comment: e.comment ?? null,
      submittedAt: e.submittedAt,
    })),
    learning,
  };
}

// Suppression. Choix assumés :
//  - un BINÔME est supprimé avec ses séances et jalons, même si l'autre
//    membre reste : les notes de séance parlent des deux personnes, et le
//    binôme n'a plus d'objet sans l'une d'elles. Le profil de l'autre membre
//    est conservé, il peut être réapparié ;
//  - une CANDIDATURE à un appel est supprimée avec ses pièces (stockage
//    compris) ; ses évaluations aussi ;
//  - les ÉVALUATIONS rendues par le compte sont supprimées : le classement se
//    recalcule sans elles, comme pour un évaluateur retiré ;
//  - l'AUTEUR de contenus éditoriaux (ressources, parcours, appels) et le
//    coordinateur d'un binôme sont effacés de la fiche, le contenu reste.
export async function deleteUserDataProgrammes(
  ctx: MutationCtx,
  userId: Id<'users'>,
) {
  const youthProfile = await ctx.db
    .query('youthProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const youthApplications = await ctx.db
    .query('youthProgramApplications')
    .withIndex('by_user_and_programme', (q) => q.eq('userId', userId))
    .collect();
  for (const a of youthApplications) await ctx.db.delete(a._id);
  if (youthProfile) await ctx.db.delete(youthProfile._id);

  for (const p of await pairsOf(ctx, userId)) {
    for (const s of await ctx.db
      .query('mentorSessions')
      .withIndex('by_pair_and_date', (q) => q.eq('pairId', p._id))
      .collect())
      await ctx.db.delete(s._id);
    for (const m of await ctx.db
      .query('mentorMilestones')
      .withIndex('by_pair', (q) => q.eq('pairId', p._id))
      .collect())
      await ctx.db.delete(m._id);
    await ctx.db.delete(p._id);
  }
  for (const p of await ctx.db
    .query('mentorProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect())
    await ctx.db.delete(p._id);

  for (const a of await applicationsOf(ctx, userId)) {
    for (const x of await ctx.db
      .query('projectCallAttachments')
      .withIndex('by_application', (q) => q.eq('applicationId', a._id))
      .collect()) {
      await ctx.storage.delete(x.storageId);
      await ctx.db.delete(x._id);
    }
    for (const e of await ctx.db
      .query('projectEvaluations')
      .withIndex('by_application', (q) => q.eq('applicationId', a._id))
      .collect())
      await ctx.db.delete(e._id);
    await ctx.db.delete(a._id);
  }
  for (const e of await ctx.db
    .query('projectEvaluations')
    .withIndex('by_evaluator', (q) => q.eq('evaluatorId', userId))
    .collect())
    await ctx.db.delete(e._id);
  for (const e of await ctx.db
    .query('projectCallEvaluators')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect())
    await ctx.db.delete(e._id);

  for (const e of await ctx.db
    .query('learningEnrollments')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()) {
    for (const r of await ctx.db
      .query('learningProgress')
      .withIndex('by_enrollment', (q) => q.eq('enrollmentId', e._id))
      .collect())
      await ctx.db.delete(r._id);
    await ctx.db.delete(e._id);
  }

  // Auteur / coordinateur effacés, contenu conservé. Ces tables sont
  // éditoriales et de petite taille (quelques centaines de lignes au plus).
  for (const table of [
    'toolboxResources',
    'learningPaths',
    'projectCalls',
  ] as const) {
    for (const row of await ctx.db.query(table).collect()) {
      if (row.createdBy === userId)
        await ctx.db.patch(row._id, { createdBy: undefined });
    }
  }
  for (const pair of await ctx.db.query('mentorPairs').collect()) {
    if (pair.proposedBy === userId)
      await ctx.db.patch(pair._id, { proposedBy: undefined });
  }
}

// --- DEV/TEST (garde AUTH_DEV_OTP) ------------------------------------------
// Remet à zéro les données « programmes » des comptes de test E2E : les
// sessions partagées portent des adresses STABLES, et un binôme laissé par
// l'exécution précédente empêcherait la suivante de réapparier les mêmes
// comptes. Ne touche qu'aux adresses en `@democracytogether.test`.
export const devResetProgrammes = internalMutation({
  args: { emails: v.array(v.string()), marker: v.optional(v.string()) },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, { emails, marker }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    let n = 0;
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (!email.endsWith('@democracytogether.test')) continue;
      const user = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .first();
      if (!user) continue;
      await deleteUserDataProgrammes(ctx, user._id);
      n++;
    }
    // Contenus de test marqués : appels, parcours et ressources dont le titre
    // porte le marqueur de l'exécution.
    if (marker && marker.length >= 6) {
      for (const call of await ctx.db.query('projectCalls').collect()) {
        if (!call.title.includes(marker)) continue;
        for (const a of await ctx.db
          .query('projectCallApplications')
          .withIndex('by_call_and_status', (q) => q.eq('callId', call._id))
          .collect()) {
          for (const x of await ctx.db
            .query('projectCallAttachments')
            .withIndex('by_application', (q) => q.eq('applicationId', a._id))
            .collect()) {
            await ctx.storage.delete(x.storageId);
            await ctx.db.delete(x._id);
          }
          for (const e of await ctx.db
            .query('projectEvaluations')
            .withIndex('by_application', (q) => q.eq('applicationId', a._id))
            .collect())
            await ctx.db.delete(e._id);
          await ctx.db.delete(a._id);
        }
        for (const e of await ctx.db
          .query('projectCallEvaluators')
          .withIndex('by_call', (q) => q.eq('callId', call._id))
          .collect())
          await ctx.db.delete(e._id);
        await ctx.db.delete(call._id);
      }
      for (const path of await ctx.db.query('learningPaths').collect()) {
        if (!path.title.includes(marker)) continue;
        for (const e of await ctx.db
          .query('learningEnrollments')
          .withIndex('by_path_and_user', (q) => q.eq('pathId', path._id))
          .collect()) {
          for (const r of await ctx.db
            .query('learningProgress')
            .withIndex('by_enrollment', (q) => q.eq('enrollmentId', e._id))
            .collect())
            await ctx.db.delete(r._id);
          await ctx.db.delete(e._id);
        }
        for (const s of await ctx.db
          .query('learningPathSteps')
          .withIndex('by_path_and_order', (q) => q.eq('pathId', path._id))
          .collect())
          await ctx.db.delete(s._id);
        await ctx.db.delete(path._id);
      }
      for (const r of await ctx.db.query('toolboxResources').collect()) {
        if (!r.title.includes(marker)) continue;
        if (r.fileId) await ctx.storage.delete(r.fileId);
        await ctx.db.delete(r._id);
      }
    }
    return n;
  },
});
