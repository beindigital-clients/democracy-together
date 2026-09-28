// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  deleteUserDataProgrammes,
  exportUserDataProgrammes,
} from './programmes';
import { WEEK_MS } from './lib/programmes';

// Chantier « programmes » (F-56 à F-60) : les règles tenues par le serveur,
// REFUS compris — mauvais rôle, mauvais propriétaire, données d'un autre,
// hors fenêtre, conflit d'intérêts.

beforeEach(() => {
  process.env.AUTH_EMAIL_PROVIDER = 'none';
});

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = ReturnType<typeof convexTest>;
type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

async function user(t: T, role: Role, name: string) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', {
      role,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@test.org`,
    }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

// ---------------------------------------------------------------------------
describe('Jeunes — profil et candidatures (F-58)', () => {
  const PROFILE = {
    displayName: 'Awa Diop',
    background: 'Master de science politique, engagée dans une association.',
    country: 'Sénégal',
    languages: ['fr' as const, 'en' as const],
    interests: ['participation'],
    availability: 'mensuelle' as const,
    consentProcessing: true,
    consentPartnerContact: false,
  };

  it('le profil persiste et la candidature s’y rattache sans ressaisie', async () => {
    const t = convexTest(schema, modules);
    const jeune = await user(t, 'visiteur', 'Awa');
    await expect(
      jeune.as.mutation(api.youthProfiles.applyToYouthProgramme, {
        programme: 'bourses',
        motivation: 'Je souhaite financer une enquête locale.',
      }),
    ).rejects.toMatchObject({ data: 'PROFILE_REQUIRED' });

    await jeune.as.mutation(api.youthProfiles.saveYouthProfile, PROFILE);
    await jeune.as.mutation(api.youthProfiles.saveYouthProfile, {
      ...PROFILE,
      country: 'Mali',
    });
    const appId = await jeune.as.mutation(
      api.youthProfiles.applyToYouthProgramme,
      {
        programme: 'bourses',
        motivation: 'Je souhaite financer une enquête locale.',
      },
    );
    const space = await jeune.as.query(api.youthProfiles.myYouthSpace, {});
    expect(space?.profile?.country).toBe('Mali');
    expect(space?.applications).toHaveLength(1);
    expect(space?.applications[0]).toMatchObject({
      _id: appId,
      status: 'pending',
    });
    // Un seul profil par compte, même après deux enregistrements.
    const profiles = await t.run((ctx) =>
      ctx.db.query('youthProfiles').collect(),
    );
    expect(profiles).toHaveLength(1);
  });

  it('refuse le profil sans consentement, et le doublon de candidature', async () => {
    const t = convexTest(schema, modules);
    const jeune = await user(t, 'visiteur', 'Kofi');
    await expect(
      jeune.as.mutation(api.youthProfiles.saveYouthProfile, {
        ...PROFILE,
        consentProcessing: false,
      }),
    ).rejects.toMatchObject({ data: 'CONSENT_REQUIRED' });
    await jeune.as.mutation(api.youthProfiles.saveYouthProfile, PROFILE);
    const motivation = {
      programme: 'hub' as const,
      motivation: 'Rejoindre le hub.',
    };
    const first = await jeune.as.mutation(
      api.youthProfiles.applyToYouthProgramme,
      motivation,
    );
    await expect(
      jeune.as.mutation(api.youthProfiles.applyToYouthProgramme, motivation),
    ).rejects.toMatchObject({ data: 'ALREADY_APPLIED' });
    // Après un retrait, on peut recandidater.
    await jeune.as.mutation(api.youthProfiles.withdrawYouthApplication, {
      applicationId: first,
    });
    await jeune.as.mutation(
      api.youthProfiles.applyToYouthProgramme,
      motivation,
    );
  });

  it('la revue est réservée au modérateur, notifie et se trace', async () => {
    const t = convexTest(schema, modules);
    const jeune = await user(t, 'visiteur', 'Lina');
    const membre = await user(t, 'membre', 'Marc');
    const mod = await user(t, 'moderateur', 'Moda');
    await jeune.as.mutation(api.youthProfiles.saveYouthProfile, PROFILE);
    const appId = await jeune.as.mutation(
      api.youthProfiles.applyToYouthProgramme,
      { programme: 'campagnes', motivation: 'Participer aux campagnes.' },
    );
    await expect(
      membre.as.query(api.youthProfiles.listYouthProgramApplications, {}),
    ).rejects.toThrow();
    await expect(
      membre.as.mutation(api.youthProfiles.reviewYouthProgramApplication, {
        applicationId: appId,
        decision: 'approved',
      }),
    ).rejects.toThrow();
    const queue = await mod.as.query(
      api.youthProfiles.listYouthProgramApplications,
      { status: 'pending' },
    );
    expect(queue[0].profile?.displayName).toBe('Awa Diop');
    await mod.as.mutation(api.youthProfiles.reviewYouthProgramApplication, {
      applicationId: appId,
      decision: 'approved',
    });
    // Une décision ne se rejoue pas d'un second clic.
    await expect(
      mod.as.mutation(api.youthProfiles.reviewYouthProgramApplication, {
        applicationId: appId,
        decision: 'rejected',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
    const notes = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', jeune.id))
        .collect(),
    );
    expect(notes.map((n) => n.titleKey)).toEqual(['youthProgrammeApproved']);
    // L'autre jeune ne voit pas la candidature de Lina.
    const autre = await user(t, 'visiteur', 'Autre');
    expect(
      (await autre.as.query(api.youthProfiles.myYouthSpace, {}))?.applications,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('Mentorat — appariement et binômes (F-59)', () => {
  const MENTEE = {
    role: 'mentore' as const,
    displayName: 'Awa',
    themes: ['participation', 'gouvernance-numerique'],
    languages: ['fr' as const],
    region: 'afrique-ouest',
    utcOffset: 0,
    availability: 'mensuelle' as const,
    goals: 'Monter un observatoire local de la participation.',
    active: true,
  };

  async function setup(t: T) {
    const coord = await user(t, 'moderateur', 'Coordinatrice');
    const mentee = await user(t, 'visiteur', 'Awa');
    const mentorA = await user(t, 'membre', 'Aminata');
    const mentorB = await user(t, 'membre', 'Pieter');
    const menteeProfile = await mentee.as.mutation(
      api.mentoring.saveMentorProfile,
      MENTEE,
    );
    const profileA = await mentorA.as.mutation(
      api.mentoring.saveMentorProfile,
      {
        ...MENTEE,
        role: 'mentor',
        displayName: 'Aminata',
        themes: ['participation', 'gouvernance-numerique', 'crises'],
        capacity: 2,
      },
    );
    const profileB = await mentorB.as.mutation(
      api.mentoring.saveMentorProfile,
      {
        ...MENTEE,
        role: 'mentor',
        displayName: 'Pieter',
        themes: ['participation'],
        languages: ['en', 'fr'],
        region: 'europe-ouest',
        utcOffset: 1,
        capacity: 1,
      },
    );
    return {
      coord,
      mentee,
      mentorA,
      mentorB,
      menteeProfile,
      profileA,
      profileB,
    };
  }

  it('le score est déterministe et expliqué par ses composantes', async () => {
    const t = convexTest(schema, modules);
    const { coord, menteeProfile, profileA, profileB } = await setup(t);
    const first = await coord.as.query(api.mentoring.suggestMentors, {
      menteeProfileId: menteeProfile,
    });
    const second = await coord.as.query(api.mentoring.suggestMentors, {
      menteeProfileId: menteeProfile,
    });
    expect(second).toEqual(first);
    expect(first.map((s) => s.mentorProfileId)).toEqual([profileA, profileB]);
    // Aminata : 2 thèmes (30) + français (25) + même région (15) + libre (15).
    expect(first[0].score).toBe(85);
    expect(first[0].reasons).toEqual([
      {
        kind: 'themes',
        points: 30,
        values: ['gouvernance-numerique', 'participation'],
      },
      { kind: 'language', points: 25, values: ['fr'] },
      { kind: 'region', points: 15, values: ['afrique-ouest'] },
      { kind: 'load', points: 15, active: 0, capacity: 2 },
    ]);
    // Pieter : 1 thème (15) + français (25) + 1 h d'écart (10) + libre (15).
    expect(first[1].score).toBe(65);
    expect(first[1].reasons[2]).toEqual({
      kind: 'timezone',
      points: 10,
      hours: 1,
    });
  });

  it('les suggestions et l’appariement sont réservés au coordinateur', async () => {
    const t = convexTest(schema, modules);
    const { mentorA, menteeProfile, profileA } = await setup(t);
    await expect(
      mentorA.as.query(api.mentoring.suggestMentors, {
        menteeProfileId: menteeProfile,
      }),
    ).rejects.toThrow();
    await expect(
      mentorA.as.mutation(api.mentoring.proposePair, {
        menteeProfileId: menteeProfile,
        mentorProfileId: profileA,
      }),
    ).rejects.toThrow();
  });

  it('un visiteur ne peut pas se déclarer mentor', async () => {
    const t = convexTest(schema, modules);
    const visiteur = await user(t, 'visiteur', 'Vis');
    await expect(
      visiteur.as.mutation(api.mentoring.saveMentorProfile, {
        ...MENTEE,
        role: 'mentor',
      }),
    ).rejects.toMatchObject({ data: 'MEMBER_REQUIRED' });
  });

  it('confirmé par le coordinateur, le binôme n’existe qu’accepté des deux', async () => {
    const t = convexTest(schema, modules);
    const {
      coord,
      mentee,
      mentorA,
      mentorB,
      menteeProfile,
      profileA,
      profileB,
    } = await setup(t);
    const pairId = await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: menteeProfile,
      mentorProfileId: profileA,
    });
    // Un mentoré n'a qu'un binôme en cours.
    await expect(
      coord.as.mutation(api.mentoring.proposePair, {
        menteeProfileId: menteeProfile,
        mentorProfileId: profileB,
      }),
    ).rejects.toMatchObject({ data: 'ALREADY_PAIRED' });
    // Un tiers ne peut pas répondre à la place d'un membre du binôme.
    await expect(
      mentorB.as.mutation(api.mentoring.respondToPair, {
        pairId,
        accept: true,
      }),
    ).rejects.toMatchObject({ data: 'NOT_FOUND' });
    // Pas de séance avant l'acceptation.
    await expect(
      mentee.as.mutation(api.mentoring.logSession, {
        pairId,
        date: Date.now(),
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ data: 'PAIR_NOT_ACTIVE' });
    expect(
      await mentee.as.mutation(api.mentoring.respondToPair, {
        pairId,
        accept: true,
      }),
    ).toBe('proposed');
    expect(
      await mentorA.as.mutation(api.mentoring.respondToPair, {
        pairId,
        accept: true,
      }),
    ).toBe('active');
    await mentee.as.mutation(api.mentoring.logSession, {
      pairId,
      date: Date.now() - 1000,
      durationMinutes: 45,
      notes: 'Notes privées : doutes sur le terrain.',
    });
    const pair = await mentorA.as.query(api.mentoring.getPair, { pairId });
    expect(pair.status).toBe('active');
    expect(pair.sessions[0].notes).toBe(
      'Notes privées : doutes sur le terrain.',
    );
    // L'acceptation vaut consentement : l'adresse de l'autre est donnée.
    expect(pair.counterpartEmail).toBe('awa@test.org');
  });

  it('le binôme est lisible par ses seuls membres et le coordinateur — sans les notes pour ce dernier', async () => {
    const t = convexTest(schema, modules);
    const { coord, mentee, mentorA, mentorB, menteeProfile, profileA } =
      await setup(t);
    const pairId = await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: menteeProfile,
      mentorProfileId: profileA,
    });
    await mentee.as.mutation(api.mentoring.respondToPair, {
      pairId,
      accept: true,
    });
    await mentorA.as.mutation(api.mentoring.respondToPair, {
      pairId,
      accept: true,
    });
    await mentorA.as.mutation(api.mentoring.logSession, {
      pairId,
      date: Date.now() - 1000,
      durationMinutes: 30,
      notes: 'Confidentiel',
    });

    expect(
      (await mentee.as.query(api.mentoring.getPair, { pairId })).viewer,
    ).toBe('mentore');
    const seenByCoord = await coord.as.query(api.mentoring.getPair, { pairId });
    expect(seenByCoord.viewer).toBe('coordinator');
    expect(seenByCoord.sessions).toHaveLength(1);
    expect(seenByCoord.sessions[0].notes).toBeNull();
    expect(seenByCoord.counterpartEmail).toBeNull();

    // Un autre membre (même mentor du réseau) : refus, comme un id inconnu.
    await expect(
      mentorB.as.query(api.mentoring.getPair, { pairId }),
    ).rejects.toMatchObject({ data: 'NOT_FOUND' });
    const anonyme = t;
    await expect(
      anonyme.query(api.mentoring.getPair, { pairId }),
    ).rejects.toThrow();
    // Le coordinateur suit, il n'écrit pas dans le journal du binôme.
    await expect(
      coord.as.mutation(api.mentoring.logSession, {
        pairId,
        date: Date.now(),
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ data: 'NOT_FOUND' });
  });

  it('suivi : jalons, pause, fin et bilan', async () => {
    const t = convexTest(schema, modules);
    const { coord, mentee, mentorA, menteeProfile, profileA } = await setup(t);
    const pairId = await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: menteeProfile,
      mentorProfileId: profileA,
    });
    await mentee.as.mutation(api.mentoring.respondToPair, {
      pairId,
      accept: true,
    });
    await mentorA.as.mutation(api.mentoring.respondToPair, {
      pairId,
      accept: true,
    });
    await mentee.as.mutation(api.mentoring.updatePairGoals, {
      pairId,
      goals: 'Publier une note d’ici juin.',
    });
    const m = await mentee.as.mutation(api.mentoring.addMilestone, {
      pairId,
      title: 'Plan de la note',
    });
    await mentorA.as.mutation(api.mentoring.setMilestoneDone, {
      milestoneId: m,
      done: true,
    });
    await expect(
      mentee.as.mutation(api.mentoring.submitFinalReview, {
        pairId,
        review: 'Trop tôt pour un bilan.',
      }),
    ).rejects.toMatchObject({ data: 'PAIR_NOT_ENDED' });
    await mentee.as.mutation(api.mentoring.setPairStatus, {
      pairId,
      status: 'paused',
    });
    await coord.as.mutation(api.mentoring.setPairStatus, {
      pairId,
      status: 'ended',
    });
    await expect(
      mentee.as.mutation(api.mentoring.setPairStatus, {
        pairId,
        status: 'active',
      }),
    ).rejects.toMatchObject({ data: 'INVALID_TRANSITION' });
    await mentee.as.mutation(api.mentoring.submitFinalReview, {
      pairId,
      review: 'Un accompagnement précieux, la note est publiée.',
    });
    const pair = await coord.as.query(api.mentoring.getPair, { pairId });
    expect(pair.status).toBe('ended');
    expect(pair.goals).toBe('Publier une note d’ici juin.');
    expect(pair.milestones[0].doneAt).not.toBeNull();
    expect(pair.menteeReview).toContain('précieux');
  });

  it('un mentor à capacité pleine n’est plus suggéré ni appariable', async () => {
    const t = convexTest(schema, modules);
    const { coord, menteeProfile, profileB } = await setup(t);
    const other = await user(t, 'visiteur', 'Second');
    const otherProfile = await other.as.mutation(
      api.mentoring.saveMentorProfile,
      MENTEE,
    );
    // Pieter (capacité 1) reçoit un premier binôme…
    await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: otherProfile,
      mentorProfileId: profileB,
    });
    const suggestions = await coord.as.query(api.mentoring.suggestMentors, {
      menteeProfileId: menteeProfile,
    });
    expect(suggestions.map((s) => s.mentorProfileId)).not.toContain(profileB);
    await expect(
      coord.as.mutation(api.mentoring.proposePair, {
        menteeProfileId: menteeProfile,
        mentorProfileId: profileB,
      }),
    ).rejects.toMatchObject({ data: 'MENTOR_FULL' });
  });

  it('alerte le coordinateur après quatre semaines sans séance, une seule fois', async () => {
    const t = convexTest(schema, modules);
    const { coord, mentee, mentorA, menteeProfile, profileA } = await setup(t);
    const pairId = await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: menteeProfile,
      mentorProfileId: profileA,
    });
    await mentee.as.mutation(api.mentoring.respondToPair, {
      pairId,
      accept: true,
    });
    await mentorA.as.mutation(api.mentoring.respondToPair, {
      pairId,
      accept: true,
    });

    // Binôme récent : pas d'alerte.
    expect(await t.mutation(internal.mentoring.checkInactivity, {})).toBe(0);

    // Dernière séance il y a cinq semaines.
    await t.run((ctx) =>
      ctx.db.patch(pairId as Id<'mentorPairs'>, {
        startedAt: Date.now() - 6 * WEEK_MS,
        lastSessionAt: Date.now() - 5 * WEEK_MS,
      }),
    );
    expect(await t.mutation(internal.mentoring.checkInactivity, {})).toBe(1);
    const alerts = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', coord.id))
        .collect(),
    );
    expect(alerts.map((n) => n.titleKey)).toEqual(['mentoringInactive']);
    expect(alerts[0].params).toEqual({ name: 'Awa' });
    // La nuit suivante : déjà alerté pour cette période.
    expect(await t.mutation(internal.mentoring.checkInactivity, {})).toBe(0);
    // L'écran de coordination signale le binôme inactif.
    const overview = await coord.as.query(api.mentoring.coordinationOverview, {
      now: Date.now(),
    });
    expect(overview.pairs.find((p) => p._id === pairId)?.inactive).toBe(true);
    // Une séance journalisée remet le compteur à zéro.
    await mentee.as.mutation(api.mentoring.logSession, {
      pairId,
      date: Date.now() - 1000,
      durationMinutes: 60,
    });
    const after = await coord.as.query(api.mentoring.coordinationOverview, {
      now: Date.now(),
    });
    expect(after.pairs.find((p) => p._id === pairId)?.inactive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Appels à projets (F-60)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const CALL = {
    title: 'Fonds jeunes chercheurs 2026',
    summary: 'Soutenir des projets de recherche-action sur la participation.',
    timeZone: 'Africa/Dakar',
    fundAmount: 50000,
    fundCurrency: 'eur',
    themes: ['participation'],
    languages: ['fr' as const, 'en' as const],
    criteria: [
      { key: 'pertinence', label: 'Pertinence', weight: 2 },
      { key: 'faisabilite', label: 'Faisabilité', weight: 1 },
    ],
    requiredDocuments: [
      { key: 'budget', label: 'Budget prévisionnel', required: true },
      { key: 'cv', label: 'CV', required: false },
    ],
  };

  async function publishedCall(
    t: T,
    admin: Awaited<ReturnType<typeof user>>,
    window: { opensAt: number; closesAt: number },
  ) {
    const callId = await admin.as.mutation(api.projectCalls.saveCall, {
      ...CALL,
      ...window,
    });
    await admin.as.mutation(api.projectCalls.setCallStatus, {
      callId,
      status: 'published',
    });
    return callId;
  }

  async function store(t: T, bytes: Uint8Array) {
    return await t.run((ctx) =>
      ctx.storage.store(new Blob([bytes as BlobPart])),
    );
  }

  it('la gestion des appels est réservée au modérateur ; un brouillon reste invisible', async () => {
    const t = convexTest(schema, modules);
    const membre = await user(t, 'membre', 'Marc');
    const admin = await user(t, 'moderateur', 'Moda');
    const window = { opensAt: Date.now() - DAY, closesAt: Date.now() + DAY };
    await expect(
      membre.as.mutation(api.projectCalls.saveCall, { ...CALL, ...window }),
    ).rejects.toThrow();
    await expect(
      admin.as.mutation(api.projectCalls.saveCall, {
        ...CALL,
        opensAt: window.closesAt,
        closesAt: window.opensAt,
      }),
    ).rejects.toMatchObject({ data: 'INVALID_WINDOW' });
    await expect(
      admin.as.mutation(api.projectCalls.saveCall, {
        ...CALL,
        ...window,
        timeZone: 'Mars/Olympus',
      }),
    ).rejects.toMatchObject({ data: 'INVALID_TIMEZONE' });
    const callId = await admin.as.mutation(api.projectCalls.saveCall, {
      ...CALL,
      ...window,
    });
    expect(await t.query(api.projectCalls.listPublicCalls, {})).toEqual([]);
    await admin.as.mutation(api.projectCalls.setCallStatus, {
      callId,
      status: 'published',
    });
    const [pub] = await t.query(api.projectCalls.listPublicCalls, {});
    expect(pub).toMatchObject({
      fundCurrency: 'EUR',
      timeZone: 'Africa/Dakar',
    });
    // Aucune donnée interne ne sort de la query publique.
    expect(Object.keys(pub)).not.toContain('createdBy');
  });

  it('une candidature hors fenêtre est refusée (avant l’ouverture, après la clôture)', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'moderateur', 'Moda');
    const membre = await user(t, 'membre', 'Marc');
    const upcoming = await publishedCall(t, admin, {
      opensAt: Date.now() + DAY,
      closesAt: Date.now() + 2 * DAY,
    });
    const closed = await publishedCall(t, admin, {
      opensAt: Date.now() - 2 * DAY,
      closesAt: Date.now() - DAY,
    });
    const app = {
      title: 'Observatoire',
      summary: 'Un observatoire citoyen du budget local.',
      language: 'fr' as const,
    };
    await expect(
      membre.as.mutation(api.projectCalls.saveCallApplication, {
        callId: upcoming,
        ...app,
      }),
    ).rejects.toMatchObject({ data: 'CALL_NOT_OPEN' });
    await expect(
      membre.as.mutation(api.projectCalls.saveCallApplication, {
        callId: closed,
        ...app,
      }),
    ).rejects.toMatchObject({ data: 'CALL_CLOSED' });

    // Un brouillon ouvert pendant la fenêtre ne se dépose plus après.
    const open = await publishedCall(t, admin, {
      opensAt: Date.now() - DAY,
      closesAt: Date.now() + DAY,
    });
    const appId = await membre.as.mutation(
      api.projectCalls.saveCallApplication,
      { callId: open, ...app },
    );
    await t.run((ctx) => ctx.db.patch(open, { closesAt: Date.now() - 1 }));
    await expect(
      membre.as.mutation(api.projectCalls.submitCallApplication, {
        applicationId: appId,
      }),
    ).rejects.toMatchObject({ data: 'CALL_CLOSED' });
    // Un visiteur (non membre) ne candidate pas.
    const visiteur = await user(t, 'visiteur', 'Vis');
    await t.run((ctx) => ctx.db.patch(open, { closesAt: Date.now() + DAY }));
    await expect(
      visiteur.as.mutation(api.projectCalls.saveCallApplication, {
        callId: open,
        ...app,
      }),
    ).rejects.toThrow();
  });

  it('pièces jointes : contenu vérifié, pièce requise exigée au dépôt', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'moderateur', 'Moda');
    const membre = await user(t, 'membre', 'Marc');
    const autre = await user(t, 'membre', 'Autre');
    const callId = await publishedCall(t, admin, {
      opensAt: Date.now() - DAY,
      closesAt: Date.now() + DAY,
    });
    const appId = await membre.as.mutation(
      api.projectCalls.saveCallApplication,
      {
        callId,
        title: 'Observatoire',
        summary: 'Un observatoire citoyen du budget local.',
        language: 'fr',
      },
    );
    await expect(
      membre.as.mutation(api.projectCalls.submitCallApplication, {
        applicationId: appId,
      }),
    ).rejects.toMatchObject({ data: 'MISSING_DOCUMENTS' });

    // Un exécutable renommé en .pdf : refusé, et retiré du stockage.
    const exe = await store(t, EXE);
    await expect(
      membre.as.action(api.projectCalls.attachDocument, {
        applicationId: appId,
        docKey: 'budget',
        storageId: exe,
        fileName: 'budget.pdf',
      }),
    ).rejects.toMatchObject({ data: 'INVALID_FILE' });
    expect(await t.run((ctx) => ctx.storage.get(exe))).toBeNull();

    // Le dossier d'un autre : refusé.
    const pdfForOther = await store(t, PDF);
    await expect(
      autre.as.action(api.projectCalls.attachDocument, {
        applicationId: appId,
        docKey: 'budget',
        storageId: pdfForOther,
        fileName: 'budget.pdf',
      }),
    ).rejects.toMatchObject({ data: 'NOT_FOUND' });

    const pdf = await store(t, PDF);
    await membre.as.action(api.projectCalls.attachDocument, {
      applicationId: appId,
      docKey: 'budget',
      storageId: pdf,
      fileName: 'budget.pdf',
    });
    await membre.as.mutation(api.projectCalls.submitCallApplication, {
      applicationId: appId,
    });
    const [mine] = await membre.as.query(
      api.projectCalls.myCallApplications,
      {},
    );
    expect(mine.status).toBe('submitted');
    expect(mine.attachments).toMatchObject([
      { docKey: 'budget', contentType: 'application/pdf' },
    ]);
    // Déposé = figé.
    await expect(
      membre.as.mutation(api.projectCalls.saveCallApplication, {
        callId,
        title: 'Autre titre',
        summary: 'Un autre résumé suffisamment long.',
        language: 'fr',
      }),
    ).rejects.toMatchObject({ data: 'ALREADY_SUBMITTED' });
  });

  it('évaluateur en conflit : exclu du classement et du dossier ; décision notifiée', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'moderateur', 'Moda');
    const porteurA = await user(t, 'membre', 'Porteur A');
    const porteurB = await user(t, 'membre', 'Porteur B');
    const evalX = await user(t, 'membre', 'Eval X');
    const evalY = await user(t, 'membre', 'Eval Y');
    const intrus = await user(t, 'membre', 'Intrus');
    const callId = await publishedCall(t, admin, {
      opensAt: Date.now() - DAY,
      closesAt: Date.now() + DAY,
    });
    const submit = async (
      p: Awaited<ReturnType<typeof user>>,
      title: string,
    ) => {
      const id = await p.as.mutation(api.projectCalls.saveCallApplication, {
        callId,
        title,
        summary: 'Un projet de recherche-action sur la participation.',
        language: 'fr',
      });
      await p.as.action(api.projectCalls.attachDocument, {
        applicationId: id,
        docKey: 'budget',
        storageId: await store(t, PDF),
        fileName: 'budget.pdf',
      });
      await p.as.mutation(api.projectCalls.submitCallApplication, {
        applicationId: id,
      });
      return id;
    };
    const appA = await submit(porteurA, 'Projet A');
    const appB = await submit(porteurB, 'Projet B');

    await admin.as.mutation(api.projectCalls.addEvaluator, {
      callId,
      email: 'eval.x@test.org',
    });
    await admin.as.mutation(api.projectCalls.addEvaluator, {
      callId,
      email: 'eval.y@test.org',
    });
    const full = (p: number, f: number) => [
      { criterionKey: 'pertinence', score: p },
      { criterionKey: 'faisabilite', score: f },
    ];
    // Un non-évaluateur ne note pas.
    await expect(
      intrus.as.mutation(api.projectCalls.submitEvaluation, {
        applicationId: appA,
        conflict: false,
        scores: full(5, 5),
      }),
    ).rejects.toMatchObject({ data: 'NOT_FOUND' });
    // Une grille incomplète est refusée.
    await expect(
      evalY.as.mutation(api.projectCalls.submitEvaluation, {
        applicationId: appA,
        conflict: false,
        scores: [{ criterionKey: 'pertinence', score: 4 }],
      }),
    ).rejects.toMatchObject({ data: 'INVALID_SCORES' });

    // X déclare un conflit sur A (qu'il aurait noté 5/5), note B.
    await evalX.as.mutation(api.projectCalls.submitEvaluation, {
      applicationId: appA,
      conflict: true,
      scores: [],
    });
    await expect(
      evalX.as.mutation(api.projectCalls.submitEvaluation, {
        applicationId: appA,
        conflict: false,
        scores: full(5, 5),
      }),
    ).rejects.toMatchObject({ data: 'CONFLICT_DECLARED' });
    await evalX.as.mutation(api.projectCalls.submitEvaluation, {
      applicationId: appB,
      conflict: false,
      scores: full(4, 4),
    });
    await evalY.as.mutation(api.projectCalls.submitEvaluation, {
      applicationId: appA,
      conflict: false,
      scores: full(2, 5), // (2×2 + 5×1) / 3 = 3 / 5 = 60
    });
    await evalY.as.mutation(api.projectCalls.submitEvaluation, {
      applicationId: appB,
      conflict: false,
      scores: full(3, 3), // 60
    });

    // X ne lit plus le contenu de A, ni ses pièces.
    const [assignment] = await evalX.as.query(
      api.projectCalls.myEvaluationAssignments,
      {},
    );
    const seenA = assignment.applications.find((a) => a._id === appA)!;
    expect(seenA).toMatchObject({
      conflict: true,
      title: null,
      summary: null,
      attachments: [],
    });
    const attachmentA = await t.run((ctx) =>
      ctx.db
        .query('projectCallAttachments')
        .withIndex('by_application', (q) => q.eq('applicationId', appA))
        .first(),
    );
    expect(
      await evalX.as.query(api.projectCalls.attachmentUrl, {
        attachmentId: attachmentA!._id,
      }),
    ).toBeNull();
    expect(
      await evalY.as.query(api.projectCalls.attachmentUrl, {
        attachmentId: attachmentA!._id,
      }),
    ).not.toBeNull();
    expect(
      await intrus.as.query(api.projectCalls.attachmentUrl, {
        attachmentId: attachmentA!._id,
      }),
    ).toBeNull();

    const ranking = await admin.as.query(api.projectCalls.callRanking, {
      callId,
    });
    // B : moyenne de X (80) et Y (60) = 70 ; A : Y seul (60), X exclu.
    expect(
      ranking.map((r) => [r.title, r.average, r.evaluations, r.excluded]),
    ).toEqual([
      ['Projet B', 70, 2, 0],
      ['Projet A', 60, 1, 1],
    ]);
    await expect(
      porteurA.as.query(api.projectCalls.callRanking, { callId }),
    ).rejects.toThrow();

    await admin.as.mutation(api.projectCalls.decideCallApplication, {
      applicationId: appB,
      decision: 'selected',
      note: 'Félicitations.',
    });
    await admin.as.mutation(api.projectCalls.decideCallApplication, {
      applicationId: appA,
      decision: 'waitlisted',
    });
    // La liste d'attente peut encore basculer ; une sélection, non.
    await expect(
      admin.as.mutation(api.projectCalls.decideCallApplication, {
        applicationId: appB,
        decision: 'rejected',
      }),
    ).rejects.toMatchObject({ data: 'INVALID_TRANSITION' });
    const notesB = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', porteurB.id))
        .collect(),
    );
    expect(notesB.map((n) => n.titleKey)).toEqual(['projectCallSelected']);
    const [mineB] = await porteurB.as.query(
      api.projectCalls.myCallApplications,
      {},
    );
    expect(mineB).toMatchObject({
      status: 'selected',
      decisionNote: 'Félicitations.',
    });
  });

  it('un évaluateur ne note pas son propre dossier', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'moderateur', 'Moda');
    const porteur = await user(t, 'membre', 'Porteur');
    const callId = await publishedCall(t, admin, {
      opensAt: Date.now() - DAY,
      closesAt: Date.now() + DAY,
    });
    const id = await porteur.as.mutation(api.projectCalls.saveCallApplication, {
      callId,
      title: 'Mon projet',
      summary: 'Un projet de recherche-action sur la participation.',
      language: 'fr',
    });
    await porteur.as.action(api.projectCalls.attachDocument, {
      applicationId: id,
      docKey: 'budget',
      storageId: await store(t, PDF),
      fileName: 'b.pdf',
    });
    await porteur.as.mutation(api.projectCalls.submitCallApplication, {
      applicationId: id,
    });
    await admin.as.mutation(api.projectCalls.addEvaluator, {
      callId,
      email: 'porteur@test.org',
    });
    await expect(
      porteur.as.mutation(api.projectCalls.submitEvaluation, {
        applicationId: id,
        conflict: false,
        scores: [
          { criterionKey: 'pertinence', score: 5 },
          { criterionKey: 'faisabilite', score: 5 },
        ],
      }),
    ).rejects.toMatchObject({ data: 'CONFLICT_OWN' });
  });
});

// ---------------------------------------------------------------------------
describe('Boîte à outils et parcours (F-56, F-57)', () => {
  async function seedPath(t: T) {
    const editor = await user(t, 'editeur', 'Edith');
    const resourceId = await editor.as.mutation(api.toolbox.saveResource, {
      title: 'Guide de la consultation citoyenne',
      summary: 'Les étapes pour organiser une consultation.',
      kind: 'guide',
      themes: ['participation'],
      language: 'fr',
      level: 'debutant',
      url: 'https://example.org/guide',
    });
    await editor.as.mutation(api.toolbox.setResourceStatus, {
      resourceId,
      status: 'published',
    });
    const pathId = await editor.as.mutation(api.toolbox.savePath, {
      title: 'Organiser une consultation',
      summary: 'Un parcours en deux étapes.',
      language: 'fr',
      level: 'debutant',
      themes: ['participation'],
    });
    await expect(
      editor.as.mutation(api.toolbox.setPathStatus, {
        pathId,
        status: 'published',
      }),
    ).rejects.toMatchObject({ data: 'NO_STEPS' });
    const s1 = await editor.as.mutation(api.toolbox.addStep, {
      pathId,
      title: 'Lire le guide',
      resourceId,
    });
    const s2 = await editor.as.mutation(api.toolbox.addStep, {
      pathId,
      title: 'Regarder le replay',
      url: '/replays/consultation',
    });
    await editor.as.mutation(api.toolbox.setPathStatus, {
      pathId,
      status: 'published',
    });
    return { editor, resourceId, pathId, s1, s2 };
  }

  it('l’édition est réservée à l’éditeur ; le catalogue ne montre que le publié', async () => {
    const t = convexTest(schema, modules);
    const mod = await user(t, 'moderateur', 'Moda');
    await expect(
      mod.as.mutation(api.toolbox.saveResource, {
        title: 'Fiche',
        summary: 'Une fiche pratique.',
        kind: 'fiche',
        themes: [],
        language: 'fr',
        level: 'debutant',
        url: 'https://example.org',
      }),
    ).rejects.toThrow();
    const { editor } = await seedPath(t);
    await expect(
      editor.as.mutation(api.toolbox.saveResource, {
        title: 'Lien piégé',
        summary: 'Une adresse qui exécute du code.',
        kind: 'lien',
        themes: [],
        language: 'fr',
        level: 'debutant',
        url: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ data: 'INVALID_URL' });
    const draft = await editor.as.mutation(api.toolbox.saveResource, {
      title: 'Brouillon',
      summary: 'Pas encore publié.',
      kind: 'modele',
      themes: [],
      language: 'en',
      level: 'avance',
      url: 'https://example.org/modele',
    });
    const list = await t.query(api.toolbox.listResources, {});
    expect(list.map((r) => r._id)).not.toContain(draft);
    expect(list).toHaveLength(1);
    const path = await t.query(api.toolbox.getPath, {
      slug: 'organiser-une-consultation',
    });
    expect(path?.stepList.map((s) => s.title)).toEqual([
      'Lire le guide',
      'Regarder le replay',
    ]);
  });

  it('progression et attestation ; la progression d’un autre membre est invisible', async () => {
    const t = convexTest(schema, modules);
    const { pathId, s1, s2 } = await seedPath(t);
    const alice = await user(t, 'membre', 'Alice');
    const bob = await user(t, 'membre', 'Bob');
    await expect(
      alice.as.mutation(api.toolbox.setStepDone, { stepId: s1, done: true }),
    ).rejects.toMatchObject({ data: 'NOT_ENROLLED' });
    const enrollmentId = await alice.as.mutation(api.toolbox.enroll, {
      pathId,
    });
    await alice.as.mutation(api.toolbox.setStepDone, {
      stepId: s1,
      done: true,
    });

    // Bob, inscrit ou non, ne voit que SA progression.
    expect(
      await bob.as.query(api.toolbox.myPathProgress, { pathId }),
    ).toBeNull();
    await bob.as.mutation(api.toolbox.enroll, { pathId });
    expect(
      (await bob.as.query(api.toolbox.myPathProgress, { pathId }))?.doneStepIds,
    ).toEqual([]);
    expect(await bob.as.query(api.toolbox.myLearning, {})).toMatchObject([
      { done: 0, steps: 2 },
    ]);

    await expect(
      alice.as.query(api.toolbox.getCertificate, { enrollmentId }),
    ).rejects.toMatchObject({ data: 'NOT_COMPLETED' });
    await alice.as.mutation(api.toolbox.setStepDone, {
      stepId: s2,
      done: true,
    });
    const cert = await alice.as.query(api.toolbox.getCertificate, {
      enrollmentId,
    });
    expect(cert).toMatchObject({
      holderName: 'Alice',
      pathTitle: 'Organiser une consultation',
      steps: 2,
    });
    expect(cert.code).toMatch(/^DT-[0-9A-F]{4}-[0-9A-F]{4}$/);
    // L'attestation d'Alice n'est pas lisible par Bob.
    await expect(
      bob.as.query(api.toolbox.getCertificate, { enrollmentId }),
    ).rejects.toMatchObject({ data: 'NOT_FOUND' });

    // Décocher une étape retire l'attestation.
    await alice.as.mutation(api.toolbox.setStepDone, {
      stepId: s2,
      done: false,
    });
    expect(
      (await alice.as.query(api.toolbox.myPathProgress, { pathId }))
        ?.completedAt,
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('Suppression et export des données (programmes)', () => {
  it('exporte puis efface les données du compte, et seulement les siennes', async () => {
    const t = convexTest(schema, modules);
    const coord = await user(t, 'moderateur', 'Coord');
    const alice = await user(t, 'membre', 'Alice');
    const bob = await user(t, 'membre', 'Bob');
    await alice.as.mutation(api.youthProfiles.saveYouthProfile, {
      displayName: 'Alice',
      background: '',
      country: 'Bénin',
      languages: ['fr'],
      interests: [],
      availability: 'ponctuelle',
      consentProcessing: true,
      consentPartnerContact: true,
    });
    const base = {
      displayName: 'Profil',
      themes: ['participation'],
      languages: ['fr' as const],
      region: 'afrique-ouest',
      availability: 'mensuelle' as const,
      goals: 'Des objectifs suffisamment décrits.',
      active: true,
    };
    const mentee = await alice.as.mutation(api.mentoring.saveMentorProfile, {
      ...base,
      role: 'mentore',
    });
    const mentor = await bob.as.mutation(api.mentoring.saveMentorProfile, {
      ...base,
      role: 'mentor',
    });
    const pairId = await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: mentee,
      mentorProfileId: mentor,
    });

    const exported = await t.run((ctx) =>
      exportUserDataProgrammes(ctx, alice.id),
    );
    expect(exported.youthProfile?.country).toBe('Bénin');
    expect(exported.mentorPairs).toHaveLength(1);
    expect(exported.mentorProfiles[0].role).toBe('mentore');

    await t.run((ctx) => deleteUserDataProgrammes(ctx, alice.id));
    const left = await t.run(async (ctx) => ({
      youth: await ctx.db.query('youthProfiles').collect(),
      profiles: await ctx.db.query('mentorProfiles').collect(),
      pair: await ctx.db.get(pairId),
    }));
    expect(left.youth).toEqual([]);
    expect(left.pair).toBeNull();
    // Le profil de Bob reste : il pourra être réapparié.
    expect(left.profiles.map((p) => p.userId)).toEqual([bob.id]);

    // Le coordinateur supprimé est effacé du binôme, le binôme reste.
    const carol = await user(t, 'visiteur', 'Carol');
    const m2 = await carol.as.mutation(api.mentoring.saveMentorProfile, {
      ...base,
      role: 'mentore',
    });
    const p2 = await coord.as.mutation(api.mentoring.proposePair, {
      menteeProfileId: m2,
      mentorProfileId: mentor,
    });
    await t.run((ctx) => deleteUserDataProgrammes(ctx, coord.id));
    const kept = await t.run((ctx) => ctx.db.get(p2));
    expect(kept?.proposedBy).toBeUndefined();
  });
});
