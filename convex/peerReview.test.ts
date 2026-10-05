// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import { PDFDocument } from 'pdf-lib';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  MANUSCRIPT_STAGES,
  nextStage,
  stageAfterAssignment,
  type ManuscriptEvent,
  type StageOrNone,
} from './lib/manuscripts';
import { deleteUserDataEditorial, exportUserDataEditorial } from './editorial';
import frMessages from '../src/messages/fr.json';
import enMessages from '../src/messages/en.json';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Peer review (F-43, editorial workstream).
//
// SIMULATED clock: the anonymized copies are scheduled on each version
// (`scheduler.runAfter(0, …)`); with simulated timers they do not run
// on their own, and the tests that need them launch the action by
// hand. The clock also serves for deadlines and reminders.
const NOW = Date.UTC(2026, 8, 27, 10, 0, 0);
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const PAGE = { paginationOpts: { numItems: 50, cursor: null } };

// The author's identity, in every form a leak would take.
const AUTHOR_NAME = 'Jeanne Autrice';
const AUTHOR_EMAIL = 'jeanne.autrice@test.org';
const AUTHOR_FILE = 'Autrice_manuscrit_final.pdf';
const AUTHOR_MARKERS = ['Jeanne', 'Autrice', AUTHOR_EMAIL];

type T = TestConvex<typeof schema>;
type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

function pubDoc(over: Record<string, unknown> = {}) {
  return {
    title: 'Gouvernance numérique comparée',
    slug: 's',
    type: 'working-paper' as const,
    theme: 'gouvernance-numerique',
    region: 'mondial' as const,
    languages: ['fr' as const],
    access: 'open' as const,
    authors: [{ name: AUTHOR_NAME }],
    year: 2026,
    publishedAt: 0,
    abstract: 'Une comparaison des cadres de gouvernance numérique.',
    keypoints: ['gouvernance', 'numérique'],
    body: [] as string[],
    doi: '',
    downloads: 0,
    citations: 0,
    status: 'pending' as const,
    createdAt: 0,
    ...over,
  };
}

async function userWithRole(
  t: T,
  role: Role,
  email: string,
  name?: string,
  reviewChief?: boolean,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role, email, name, reviewChief }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

// A PDF manuscript that names its author in its metadata — the real case.
async function pdfWithAuthor(title = 'v1'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText(`Texte anonyme ${title}`, { x: 20, y: 200 });
  doc.setAuthor(AUTHOR_NAME);
  doc.setCreator(`Word - ${AUTHOR_NAME}`);
  return await doc.save({ useObjectStreams: false });
}

async function storePdf(t: T, title?: string): Promise<Id<'_storage'>> {
  const bytes = await pdfWithAuthor(title);
  return await t.run((ctx) =>
    ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    ),
  );
}

async function setup(t: T) {
  const author = await userWithRole(t, 'membre', AUTHOR_EMAIL, AUTHOR_NAME);
  // The editor holds the review chief function: deciding a manuscript
  // publishes it, which only a review chief or an administrator may do (D-7).
  const editor = await userWithRole(
    t,
    'editeur',
    'eric@test.org',
    'Éric Éditeur',
    true,
  );
  const rev1 = await userWithRole(
    t,
    'moderateur',
    'remi@test.org',
    'Rémi Relecteur',
  );
  const rev2 = await userWithRole(
    t,
    'moderateur',
    'rita@test.org',
    'Rita Relectrice',
  );
  const fileId = await storePdf(t);
  const pubId = await t.run((ctx) =>
    ctx.db.insert(
      'publications',
      pubDoc({
        slug: 'gouvernance-numerique-comparee',
        authorUserId: author.id,
        fileId,
        fileName: AUTHOR_FILE,
        submittedAt: NOW - DAY,
      }),
    ),
  );
  return { author, editor, rev1, rev2, pubId, fileId };
}

async function latestVersionId(t: T, pubId: Id<'publications'>) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query('manuscriptVersions')
      .withIndex('by_publication_and_version', (q) =>
        q.eq('publicationId', pubId),
      )
      .order('desc')
      .take(1),
  );
  return rows[0]._id;
}

// Runs the anonymization of the latest version (scheduled in production).
async function anonymizeLatest(t: T, pubId: Id<'publications'>) {
  await t.action(internal.peerReviewFiles.anonymizeVersion, {
    versionId: await latestVersionId(t, pubId),
  });
}

type Setup = Awaited<ReturnType<typeof setup>>;

// Submission by the author, two reviewers assigned, no conflict.
async function openWithTwoReviewers(t: T, s: Setup) {
  await s.author.as.mutation(api.peerReview.submitManuscript, {
    publicationId: s.pubId,
  });
  await anonymizeLatest(t, s.pubId);
  for (const r of [s.rev1, s.rev2]) {
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: r.id,
    });
    await r.as.mutation(api.peerReview.declareConflict, {
      publicationId: s.pubId,
      hasConflict: false,
    });
  }
}

const REASON =
  'Les deux avis convergent : la section méthode doit être reprise.';

describe('Soumission par l’auteur (F-43)', () => {
  it('ouvre le manuscrit, fige la version 1, prévient le comité ; refuse le dépôt d’un autre', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const intruder = await userWithRole(t, 'membre', 'x@test.org', 'Intrus');

    // Someone else's submission reads as non-existent.
    await expect(
      intruder.as.mutation(api.peerReview.submitManuscript, {
        publicationId: s.pubId,
      }),
    ).rejects.toThrow('NOT_FOUND');

    const res = await s.author.as.mutation(api.peerReview.submitManuscript, {
      publicationId: s.pubId,
      keywords: ['gouvernance', 'Afrique'],
    });
    expect(res).toEqual({ ok: true, version: 1 });
    const pub = await t.run((ctx) => ctx.db.get(s.pubId));
    expect(pub?.reviewStage).toBe('submitted');
    expect(pub?.status).toBe('pending');

    const versions = await t.run((ctx) =>
      ctx.db.query('manuscriptVersions').collect(),
    );
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: 1,
      keywords: ['gouvernance', 'Afrique'],
      blindStatus: 'pending',
      submittedBy: s.author.id,
    });

    // The editor is notified, not the reviewers.
    const notes = await s.editor.as.query(
      api.notifications.myNotifications,
      {},
    );
    expect(notes.map((n) => n.titleKey)).toEqual(['manuscriptSubmitted']);
    expect(
      await s.rev1.as.query(api.notifications.myNotifications, {}),
    ).toHaveLength(0);

    // A second submission is not a transition.
    await expect(
      s.author.as.mutation(api.peerReview.submitManuscript, {
        publicationId: s.pubId,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });
});

describe('Désignation des relecteurs (F-43)', () => {
  it('éditeur seulement ; échéance par défaut ; refus nommés', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.author.as.mutation(api.peerReview.submitManuscript, {
      publicationId: s.pubId,
    });

    await expect(
      s.rev1.as.mutation(api.peerReview.assignReviewer, {
        publicationId: s.pubId,
        reviewerUserId: s.rev1.id,
      }),
    ).rejects.toThrow();
    await expect(
      s.editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: s.pubId,
        reviewerUserId: s.author.id,
      }),
    ).rejects.toThrow('REVIEWER_NOT_STAFF');
    await expect(
      s.editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: s.pubId,
        reviewerUserId: s.rev1.id,
        dueAt: NOW - DAY,
      }),
    ).rejects.toThrow('INVALID_DUE_DATE');

    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: s.rev1.id,
    });
    expect((await t.run((ctx) => ctx.db.get(s.pubId)))?.reviewStage).toBe(
      'in_review',
    );
    const [a] = await t.run((ctx) =>
      ctx.db.query('peerReviewAssignments').collect(),
    );
    expect(a).toMatchObject({ version: 1, dueAt: NOW + 21 * DAY });

    // Second reviewer, chosen deadline: the review stays under evaluation.
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: s.rev2.id,
      dueAt: NOW + 10 * DAY,
    });
    await expect(
      s.editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: s.pubId,
        reviewerUserId: s.rev2.id,
      }),
    ).rejects.toThrow('ALREADY_ASSIGNED');

    const notes = await s.rev1.as.query(api.notifications.myNotifications, {});
    expect(notes[0]).toMatchObject({
      titleKey: 'peerReviewAssigned',
      link: '/admin/mes-relectures',
    });
  });

  it('refuse l’auteur comme relecteur de son propre texte (REVIEWER_IS_AUTHOR)', async () => {
    const t = convexTest(schema, modules);
    const editor = await userWithRole(
      t,
      'editeur',
      'ed@test.org',
      undefined,
      true,
    );
    const modAuthor = await userWithRole(t, 'moderateur', 'moda@test.org');
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ authorUserId: modAuthor.id })),
    );
    await expect(
      editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: pubId,
        reviewerUserId: modAuthor.id,
      }),
    ).rejects.toThrow('REVIEWER_IS_AUTHOR');
  });

  it('ouvre une revue depuis la file de modération (publication jamais soumise) : v1 créée', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: s.rev1.id,
    });
    const pub = await t.run((ctx) => ctx.db.get(s.pubId));
    expect(pub?.reviewStage).toBe('in_review');
    const versions = await t.run((ctx) =>
      ctx.db.query('manuscriptVersions').collect(),
    );
    expect(versions.map((v) => v.version)).toEqual([1]);
    expect(await s.editor.as.query(api.peerReview.listOpenable, {})).toEqual(
      [],
    );
  });
});

describe('Conflit d’intérêts (F-43)', () => {
  it('préalable à l’avis et au fichier ; un conflit récuse et prévient l’éditeur', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.author.as.mutation(api.peerReview.submitManuscript, {
      publicationId: s.pubId,
    });
    await anonymizeLatest(t, s.pubId);
    for (const r of [s.rev1, s.rev2]) {
      await s.editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: s.pubId,
        reviewerUserId: r.id,
      });
    }
    const outsider = await userWithRole(t, 'moderateur', 'o@test.org', 'Hors');

    const review = {
      publicationId: s.pubId,
      recommendation: 'minor' as const,
      comment: 'Texte solide, quelques précisions attendues.',
    };
    await expect(
      s.rev1.as.mutation(api.peerReview.submitReview, review),
    ).rejects.toThrow('CONFLICT_NOT_DECLARED');
    await expect(
      outsider.as.mutation(api.peerReview.submitReview, review),
    ).rejects.toThrow('NOT_ASSIGNED');
    await expect(
      outsider.as.mutation(api.peerReview.declareConflict, {
        publicationId: s.pubId,
        hasConflict: false,
      }),
    ).rejects.toThrow('NOT_ASSIGNED');

    // Before the declaration: no file.
    const before = await s.rev1.as.query(api.peerReview.getAssignment, {
      publicationId: s.pubId,
    });
    expect(before?.conflict).toBe('undeclared');
    expect(before?.file.url).toBeNull();

    await s.rev1.as.mutation(api.peerReview.declareConflict, {
      publicationId: s.pubId,
      hasConflict: false,
    });
    const after = await s.rev1.as.query(api.peerReview.getAssignment, {
      publicationId: s.pubId,
    });
    expect(after?.conflict).toBe('clear');
    expect(after?.file.url).toEqual(expect.any(String));
    // NEUTRAL name, never that of the submission.
    expect(after?.file.name).toBe('manuscrit-v1.pdf');
    await expect(
      s.rev1.as.mutation(api.peerReview.declareConflict, {
        publicationId: s.pubId,
        hasConflict: true,
      }),
    ).rejects.toThrow('CONFLICT_ALREADY_DECLARED');

    // Rita recuses herself.
    await s.rev2.as.mutation(api.peerReview.declareConflict, {
      publicationId: s.pubId,
      hasConflict: true,
      details: 'Co-autrice d’un travail récent sur le même terrain.',
    });
    await expect(
      s.rev2.as.mutation(api.peerReview.submitReview, review),
    ).rejects.toThrow('CONFLICT_DECLARED');
    const rita = await s.rev2.as.query(api.peerReview.getAssignment, {
      publicationId: s.pubId,
    });
    expect(rita?.file.url).toBeNull();
    const assignments = await t.run((ctx) =>
      ctx.db.query('peerReviewAssignments').collect(),
    );
    expect(assignments.find((a) => a.reviewerUserId === s.rev2.id)?.dueAt).toBe(
      undefined,
    );
    const editorNotes = await s.editor.as.query(
      api.notifications.myNotifications,
      {},
    );
    expect(editorNotes.map((n) => n.titleKey)).toContain('peerReviewConflict');
    // A recused reviewer is not reassigned.
    await expect(
      s.editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: s.pubId,
        reviewerUserId: s.rev2.id,
      }),
    ).rejects.toThrow('CONFLICT_DECLARED');

    // The editor's queue shows it.
    const { page } = await s.editor.as.query(
      api.peerReview.getReviewQueue,
      PAGE,
    );
    const conflicts = page[0].assignments.map((a) => a.conflict).sort();
    expect(conflicts).toEqual(['clear', 'conflict']);
  });
});

describe('Parcours complet : soumis → deux relecteurs → révision → v2 → accepté', () => {
  it('versions ordonnées, lettre de réponse, différentiel, publication à l’acceptation', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);

    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'major',
      comment: 'La méthode de comparaison doit être explicitée.',
      commentToEditor: 'Texte prometteur, auteur sans doute débutant.',
    });
    await s.rev2.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'minor',
      comment: 'Quelques références manquent en section 3.',
    });
    await expect(
      s.rev2.as.mutation(api.peerReview.submitReview, {
        publicationId: s.pubId,
        recommendation: 'accept',
        comment: 'Un second avis sur la même version.',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    // Reasoned decision: a reason that is too short is refused.
    await expect(
      s.editor.as.mutation(api.peerReview.decideManuscript, {
        publicationId: s.pubId,
        decision: 'revision',
        reason: 'À revoir.',
      }),
    ).rejects.toThrow('INVALID_REASON');
    await s.editor.as.mutation(api.peerReview.decideManuscript, {
      publicationId: s.pubId,
      decision: 'revision',
      reason: REASON,
    });
    expect((await t.run((ctx) => ctx.db.get(s.pubId)))?.reviewStage).toBe(
      'revision',
    );
    // The round is closed: no deadline set anymore.
    const open = await t.run((ctx) =>
      ctx.db.query('peerReviewAssignments').collect(),
    );
    expect(open.every((a) => a.dueAt === undefined)).toBe(true);

    // The author sees the reasoned decision and the NUMBERED reviews, never the
    // confidential comment to the editor.
    const mine = await s.author.as.query(api.peerReview.myManuscripts, {});
    expect(mine.manuscripts).toHaveLength(1);
    const m = mine.manuscripts[0];
    expect(m.reviewStage).toBe('revision');
    expect(m.canRevise).toBe(true);
    expect(m.decisions).toEqual([
      expect.objectContaining({
        decision: 'revision',
        reason: REASON,
        version: 1,
      }),
    ]);
    expect(m.reviews.map((r) => [r.index, r.recommendation])).toEqual([
      [1, 'major'],
      [2, 'minor'],
    ]);
    expect(JSON.stringify(mine)).not.toContain('débutant');
    const authorNotes = await s.author.as.query(
      api.notifications.myNotifications,
      {},
    );
    expect(authorNotes[0]).toMatchObject({
      titleKey: 'peerReviewRevisionRequested',
      link: '/espace-membre/manuscrits',
    });

    // Revision: new version, response letter mandatory.
    const v2File = await storePdf(t, 'v2');
    const revision = {
      publicationId: s.pubId,
      title: 'Gouvernance numérique comparée : méthode et cas',
      abstract:
        'Une comparaison des cadres de gouvernance numérique, méthode explicitée.',
      keywords: ['gouvernance', 'méthode'],
      fileId: v2File,
      fileName: 'Autrice_v2.pdf',
      responseLetter:
        'Merci aux relecteurs : la méthode est désormais détaillée en section 2.',
    };
    await expect(
      s.author.as.mutation(api.peerReview.submitRevision, {
        ...revision,
        responseLetter: 'Merci.',
      }),
    ).rejects.toThrow('INVALID_RESPONSE_LETTER');
    const intruder = await userWithRole(t, 'membre', 'z@test.org');
    await expect(
      intruder.as.mutation(api.peerReview.submitRevision, revision),
    ).rejects.toThrow('NOT_FOUND');
    expect(
      await s.author.as.mutation(api.peerReview.submitRevision, revision),
    ).toEqual({ ok: true, version: 2 });
    expect((await t.run((ctx) => ctx.db.get(s.pubId)))?.reviewStage).toBe(
      'resubmitted',
    );
    // An unrequested revision is not a transition.
    await expect(
      s.author.as.mutation(api.peerReview.submitRevision, revision),
    ).rejects.toThrow('INVALID_TRANSITION');
    await anonymizeLatest(t, s.pubId);

    // ORDERED versions, nothing rewritten in v1.
    const dossier = await s.editor.as.query(
      api.peerReview.getManuscriptForEditor,
      { publicationId: s.pubId },
    );
    expect(dossier?.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(dossier?.versions[0].responseLetter).toBeNull();
    expect(dossier?.versions[0].title).toBe('Gouvernance numérique comparée');
    expect(dossier?.versions[1].responseLetter).toContain(
      'Merci aux relecteurs',
    );
    expect(dossier?.reviews.map((r) => r.version)).toEqual([1, 1]);
    // The editor sees everything: the author, and the confidential comment.
    expect(dossier?.authorEmail).toBe(AUTHOR_EMAIL);
    expect(dossier?.reviews[0].commentToEditor).toContain('débutant');

    // New round: Rémi evaluates v2 — his conflict declaration still
    // stands.
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: s.rev1.id,
    });
    const view = await s.rev1.as.query(api.peerReview.getAssignment, {
      publicationId: s.pubId,
    });
    expect(view?.version).toBe(2);
    expect(view?.conflict).toBe('clear');
    expect(view?.responseLetter).toContain('Merci aux relecteurs');
    expect(view?.diff).toMatchObject({
      fromVersion: 1,
      title: {
        from: 'Gouvernance numérique comparée',
        to: 'Gouvernance numérique comparée : méthode et cas',
      },
      keywordsAdded: ['méthode'],
      keywordsRemoved: ['numérique'],
      fileReplaced: true,
    });
    expect(view?.file.name).toBe('manuscrit-v2.pdf');
    expect(view?.myReviews.map((r) => r.version)).toEqual([1]);
    // Rita is not part of this round: her assignment still refers to v1.
    await expect(
      s.rev2.as.mutation(api.peerReview.submitReview, {
        publicationId: s.pubId,
        recommendation: 'accept',
        comment: 'Je n’ai pas été désignée sur la v2.',
      }),
    ).rejects.toThrow('NOT_ASSIGNED');

    // Acceptance without a review on v2: refused.
    await expect(
      s.editor.as.mutation(api.peerReview.decideManuscript, {
        publicationId: s.pubId,
        decision: 'accepted',
        reason: 'La méthode est désormais claire et bien documentée.',
      }),
    ).rejects.toThrow('NO_REVIEWS');
    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'accept',
      comment: 'Les corrections répondent aux remarques.',
    });
    const decided = await s.editor.as.mutation(
      api.peerReview.decideManuscript,
      {
        publicationId: s.pubId,
        decision: 'accepted',
        reason: 'La méthode est désormais claire et bien documentée.',
      },
    );
    expect(decided).toEqual({ ok: true, published: true });

    // AUTOMATIC publication in the library, with the accepted version.
    const pub = await t.run((ctx) => ctx.db.get(s.pubId));
    expect(pub).toMatchObject({
      reviewStage: 'accepted',
      status: 'published',
      title: revision.title,
      fileId: v2File,
      doi: '10.59000/dt.gouvernance-numerique-comparee',
    });
    const inLibrary = await t.query(api.publications.getBySlug, {
      slug: 'gouvernance-numerique-comparee',
    });
    expect(inLibrary?.title).toBe(revision.title);
    const last = await s.author.as.query(api.notifications.myNotifications, {});
    expect(last.map((n) => n.titleKey)).toContain('peerReviewAccepted');

    // A decision once made is not replayed.
    await expect(
      s.editor.as.mutation(api.peerReview.decideManuscript, {
        publicationId: s.pubId,
        decision: 'rejected',
        reason: 'Revirement après publication, refusé par la machine.',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
  });

  it('rejet : le dépôt sort de la file de modération, motif à l’auteur', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.author.as.mutation(api.peerReview.submitManuscript, {
      publicationId: s.pubId,
    });
    // Editorial rejection WITHOUT review, from `submitted`.
    await s.editor.as.mutation(api.peerReview.decideManuscript, {
      publicationId: s.pubId,
      decision: 'rejected',
      reason: 'Le texte sort du champ de la revue (hors des cinq axes).',
    });
    const pub = await t.run((ctx) => ctx.db.get(s.pubId));
    expect(pub).toMatchObject({
      reviewStage: 'rejected',
      status: 'draft',
      reviewNotes: 'Le texte sort du champ de la revue (hors des cinq axes).',
    });
    const notes = await s.author.as.query(
      api.notifications.myNotifications,
      {},
    );
    expect(notes[0].titleKey).toBe('peerReviewRejected');
  });
});

// ALL transitions: each operation attempted from each stage. What
// is not in the table is refused with the machine's error, and writes
// nothing (no stage, no decision, no version).
describe('Machine à états : toute transition hors table est refusée (F-43)', () => {
  type Op = {
    name: string;
    event: ManuscriptEvent | 'assign';
  };
  const OPS: Op[] = [
    { name: 'submitManuscript', event: 'submit' },
    { name: 'assignReviewer', event: 'assign' },
    { name: 'decide revision', event: 'requestRevision' },
    { name: 'decide accepted', event: 'accept' },
    { name: 'decide rejected', event: 'reject' },
    { name: 'submitRevision', event: 'resubmit' },
  ];
  const STAGES: StageOrNone[] = ['none', ...MANUSCRIPT_STAGES];

  function expected(from: StageOrNone, event: Op['event']): string | null {
    try {
      if (event === 'assign') stageAfterAssignment(from);
      else nextStage(from, event);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  const cases = STAGES.flatMap((from) => OPS.map((op) => [from, op] as const));

  it.each(cases)('%s + %o', async (from, op) => {
    const t = convexTest(schema, modules);
    const author = await userWithRole(t, 'membre', 'a@test.org', 'A');
    const editor = await userWithRole(t, 'editeur', 'e@test.org', 'E', true);
    const reviewer = await userWithRole(t, 'moderateur', 'r@test.org', 'R');
    const fileId = await storePdf(t);
    const pubId = await t.run(async (ctx) => {
      const id = await ctx.db.insert(
        'publications',
        pubDoc({
          authorUserId: author.id,
          ...(from === 'none' ? {} : { reviewStage: from }),
        }),
      );
      if (from !== 'none') {
        await ctx.db.insert('manuscriptVersions', {
          publicationId: id,
          version: 1,
          title: 'T',
          abstract: 'Résumé suffisamment long pour la borne.',
          keywords: [],
          blindStatus: 'none',
          submittedBy: author.id,
          createdAt: 0,
        });
        // A review on the current version: `NO_REVIEWS` must not mask
        // what the machine decides.
        await ctx.db.insert('peerReviews', {
          publicationId: id,
          reviewerUserId: reviewer.id,
          reviewerName: 'R',
          recommendation: 'minor',
          comment: 'Avis de préparation du test.',
          version: 1,
          createdAt: 0,
        });
      }
      return id;
    });

    const reason = 'Motif détaillé de la décision éditoriale.';
    const run = () => {
      switch (op.event) {
        case 'submit':
          return author.as.mutation(api.peerReview.submitManuscript, {
            publicationId: pubId,
          });
        case 'assign':
          return editor.as.mutation(api.peerReview.assignReviewer, {
            publicationId: pubId,
            reviewerUserId: reviewer.id,
          });
        case 'requestRevision':
          return editor.as.mutation(api.peerReview.decideManuscript, {
            publicationId: pubId,
            decision: 'revision',
            reason,
          });
        case 'accept':
          return editor.as.mutation(api.peerReview.decideManuscript, {
            publicationId: pubId,
            decision: 'accepted',
            reason,
          });
        case 'reject':
          return editor.as.mutation(api.peerReview.decideManuscript, {
            publicationId: pubId,
            decision: 'rejected',
            reason,
          });
        case 'resubmit':
          return author.as.mutation(api.peerReview.submitRevision, {
            publicationId: pubId,
            title: 'Titre révisé',
            abstract: 'Résumé révisé, assez long pour passer la borne.',
            keywords: [],
            fileId,
            fileName: 'v2.pdf',
            responseLetter: 'Réponse détaillée aux relecteurs.',
          });
      }
    };

    const code = expected(from, op.event);
    const before = await t.run(async (ctx) => ({
      stage: (await ctx.db.get(pubId))?.reviewStage,
      decisions: (await ctx.db.query('manuscriptDecisions').collect()).length,
      versions: (await ctx.db.query('manuscriptVersions').collect()).length,
    }));
    if (code) {
      await expect(run()).rejects.toThrow(code);
      const after = await t.run(async (ctx) => ({
        stage: (await ctx.db.get(pubId))?.reviewStage,
        decisions: (await ctx.db.query('manuscriptDecisions').collect()).length,
        versions: (await ctx.db.query('manuscriptVersions').collect()).length,
      }));
      expect(after).toEqual(before);
    } else {
      await run();
      const stage = (await t.run((ctx) => ctx.db.get(pubId)))?.reviewStage;
      expect(stage).toBe(
        op.event === 'assign'
          ? stageAfterAssignment(from)
          : nextStage(from, op.event),
      );
    }
  });
});

describe('Double aveugle — le relecteur ne voit JAMAIS l’auteur (F-43)', () => {
  it('aucune réponse de requête accessible au relecteur ne nomme l’auteur', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);

    // The transmitted file: anonymized copy, without the name in its bytes.
    const [ver] = await t.run((ctx) =>
      ctx.db.query('manuscriptVersions').collect(),
    );
    expect(ver.blindStatus).toBe('stripped');
    expect(ver.strippedFields).toEqual(
      expect.arrayContaining(['Author', 'Creator']),
    );
    const blindText = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(ver.blindFileId as Id<'_storage'>);
      const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
      return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    });
    for (const marker of AUTHOR_MARKERS)
      expect(blindText).not.toContain(marker);

    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'minor',
      comment: 'Avis déposé avant la collecte des réponses.',
    });

    // ALL the queries a reviewer (moderator) can call on this
    // manuscript — including the moderation queue, where a moderator
    // normally sees the author of each submission.
    const responses: Record<string, unknown> = {
      myAssignments: await s.rev1.as.query(api.peerReview.myAssignments, {}),
      getAssignment: await s.rev1.as.query(api.peerReview.getAssignment, {
        publicationId: s.pubId,
      }),
      reviewStagesFor: await s.rev1.as.query(api.peerReview.reviewStagesFor, {
        publicationIds: [s.pubId],
      }),
      listForReviewPending: await s.rev1.as.query(
        api.publications.listForReview,
        { status: 'pending', ...PAGE },
      ),
      listForReviewAll: await s.rev1.as.query(api.publications.listForReview, {
        status: 'all',
        ...PAGE,
      }),
      notifications: await s.rev1.as.query(
        api.notifications.myNotifications,
        {},
      ),
      aiReview: await s.rev1.as.query(api.aiModeration.getReview, {
        publicationId: s.pubId,
      }),
    };
    // The moderation queue does return the row — without the author.
    expect(
      (responses.listForReviewPending as { page: { _id: string }[] }).page.map(
        (p) => p._id,
      ),
    ).toContain(s.pubId);
    for (const [name, response] of Object.entries(responses)) {
      const json = JSON.stringify(response);
      for (const marker of [...AUTHOR_MARKERS, AUTHOR_FILE, s.author.id]) {
        expect(json, `${name} contient « ${marker} »`).not.toContain(marker);
      }
    }
    // The editor's views, however, are refused to them.
    await expect(
      s.rev1.as.query(api.peerReview.getReviewQueue, PAGE),
    ).rejects.toThrow();
    await expect(
      s.rev1.as.query(api.peerReview.getManuscriptForEditor, {
        publicationId: s.pubId,
      }),
    ).rejects.toThrow();

    // Control: the editor, however, does see the author (rule 3).
    const editorView = await s.editor.as.query(api.publications.listForReview, {
      status: 'pending',
      ...PAGE,
    });
    expect(JSON.stringify(editorView)).toContain(AUTHOR_EMAIL);
    const { page } = await s.editor.as.query(
      api.peerReview.getReviewQueue,
      PAGE,
    );
    expect(page[0].authorEmail).toBe(AUTHOR_EMAIL);
  });

  it('un PDF illisible n’est pas transmis tant que l’éditeur ne l’a pas libéré', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const junk = await t.run((ctx) =>
      ctx.storage.store(new Blob(['pas un PDF'], { type: 'application/pdf' })),
    );
    await t.run((ctx) => ctx.db.patch(s.pubId, { fileId: junk }));
    await openWithTwoReviewers(t, s);
    const view = await s.rev1.as.query(api.peerReview.getAssignment, {
      publicationId: s.pubId,
    });
    expect(view?.file.blindStatus).toBe('unreadable');
    expect(view?.file.url).toBeNull();

    await expect(
      s.rev1.as.mutation(api.peerReview.releaseVersionFile, {
        publicationId: s.pubId,
        version: 1,
      }),
    ).rejects.toThrow();
    await s.editor.as.mutation(api.peerReview.releaseVersionFile, {
      publicationId: s.pubId,
      version: 1,
    });
    const released = await s.rev1.as.query(api.peerReview.getAssignment, {
      publicationId: s.pubId,
    });
    expect(released?.file.url).toEqual(expect.any(String));
    // A release is not replayed.
    await expect(
      s.editor.as.mutation(api.peerReview.releaseVersionFile, {
        publicationId: s.pubId,
        version: 1,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });
});

describe('Double aveugle — l’auteur ne voit JAMAIS ses relecteurs (F-43)', () => {
  it('ni nom, ni adresse, ni identifiant de relecteur dans son suivi', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);
    for (const r of [s.rev1, s.rev2]) {
      await r.as.mutation(api.peerReview.submitReview, {
        publicationId: s.pubId,
        recommendation: 'minor',
        comment: 'Des précisions sont attendues sur le corpus.',
      });
    }
    // Before the decision: the author does not see the reviews yet.
    const early = await s.author.as.query(api.peerReview.myManuscripts, {});
    expect(early.manuscripts[0].reviews).toEqual([]);

    await s.editor.as.mutation(api.peerReview.decideManuscript, {
      publicationId: s.pubId,
      decision: 'revision',
      reason: REASON,
    });
    const responses = {
      myManuscripts: await s.author.as.query(api.peerReview.myManuscripts, {}),
      revision: await s.author.as.query(api.peerReview.myRevisionContext, {
        publicationId: s.pubId,
      }),
      notifications: await s.author.as.query(
        api.notifications.myNotifications,
        {},
      ),
    };
    expect(responses.myManuscripts.manuscripts[0].reviews).toHaveLength(2);
    const markers = [
      'Rémi',
      'Relecteur',
      'Rita',
      'Relectrice',
      'remi@test.org',
      'rita@test.org',
      'Éric',
      s.rev1.id,
      s.rev2.id,
      s.editor.id,
    ];
    for (const [name, response] of Object.entries(responses)) {
      const json = JSON.stringify(response);
      for (const marker of markers) {
        expect(json, `${name} contient « ${marker} »`).not.toContain(marker);
      }
    }
    // And the author has access to no reviewer or editor view.
    await expect(
      s.author.as.query(api.peerReview.myAssignments, {}),
    ).rejects.toThrow();
    await expect(
      s.author.as.query(api.peerReview.getManuscriptForEditor, {
        publicationId: s.pubId,
      }),
    ).rejects.toThrow();
  });
});

describe('Relances à l’échéance (F-43)', () => {
  it('relance à l’échéance, tous les trois jours, trois fois, puis prévient l’éditeur', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.author.as.mutation(api.peerReview.submitManuscript, {
      publicationId: s.pubId,
    });
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: s.rev1.id,
      dueAt: NOW + 2 * DAY,
    });
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: s.pubId,
      reviewerUserId: s.rev2.id,
      dueAt: NOW + 30 * DAY,
    });
    const reminders = async (u: { as: typeof s.rev1.as }, key: string) =>
      (await u.as.query(api.notifications.myNotifications, {})).filter(
        (n) => n.titleKey === key,
      ).length;

    // Before the deadline: nothing.
    expect(await t.mutation(internal.peerReview.sendDueReminders, {})).toEqual({
      reminded: 0,
      escalated: 0,
      closed: 0,
    });

    // Deadline passed: first reminder — for Rémi only.
    vi.setSystemTime(NOW + 2 * DAY + 3_600_000);
    expect(
      (await t.mutation(internal.peerReview.sendDueReminders, {})).reminded,
    ).toBe(1);
    expect(await reminders(s.rev1, 'peerReviewReminder')).toBe(1);
    expect(await reminders(s.rev2, 'peerReviewReminder')).toBe(0);
    const note = (
      await s.rev1.as.query(api.notifications.myNotifications, {})
    )[0];
    expect(note).toMatchObject({ link: '/admin/mes-relectures' });
    expect(note.params.title).toBe('Gouvernance numérique comparée');

    // The next day: no duplicate (three-day interval).
    vi.setSystemTime(NOW + 3 * DAY + 3_600_000);
    await t.mutation(internal.peerReview.sendDueReminders, {});
    expect(await reminders(s.rev1, 'peerReviewReminder')).toBe(1);

    // Second and third reminders, then the editor is notified, once.
    vi.setSystemTime(NOW + 6 * DAY);
    await t.mutation(internal.peerReview.sendDueReminders, {});
    vi.setSystemTime(NOW + 9 * DAY + 3_600_000);
    await t.mutation(internal.peerReview.sendDueReminders, {});
    expect(await reminders(s.rev1, 'peerReviewReminder')).toBe(3);
    vi.setSystemTime(NOW + 13 * DAY);
    expect(
      (await t.mutation(internal.peerReview.sendDueReminders, {})).escalated,
    ).toBe(1);
    expect(await reminders(s.editor, 'peerReviewOverdue')).toBe(1);
    vi.setSystemTime(NOW + 17 * DAY);
    await t.mutation(internal.peerReview.sendDueReminders, {});
    expect(await reminders(s.editor, 'peerReviewOverdue')).toBe(1);
    expect(await reminders(s.rev1, 'peerReviewReminder')).toBe(3);

    // The submitted review turns off the reminder.
    await s.rev1.as.mutation(api.peerReview.declareConflict, {
      publicationId: s.pubId,
      hasConflict: false,
    });
    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'accept',
      comment: 'Avis rendu en retard, mais rendu.',
    });
    const [a1] = await t.run((ctx) =>
      ctx.db
        .query('peerReviewAssignments')
        .withIndex('by_publication_and_reviewer', (q) =>
          q.eq('publicationId', s.pubId).eq('reviewerUserId', s.rev1.id),
        )
        .collect(),
    );
    expect(a1.dueAt).toBeUndefined();

    // A deadline left set on a closed round is cleared, not reminded.
    await s.editor.as.mutation(api.peerReview.decideManuscript, {
      publicationId: s.pubId,
      decision: 'revision',
      reason: REASON,
    });
    await t.run((ctx) => ctx.db.patch(a1._id, { dueAt: NOW + 17 * DAY - 1 }));
    const sweep = await t.mutation(internal.peerReview.sendDueReminders, {});
    expect(sweep.closed).toBe(1);
    expect(await reminders(s.rev1, 'peerReviewReminder')).toBe(3);
  });
});

describe('File de l’éditeur (F-43)', () => {
  it('éditeur seulement ; agrège les avis de la version courante', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);
    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'minor',
      comment: 'Quelques retouches mineures suffisent.',
    });
    await s.rev2.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'reject',
      comment: 'Méthodologie insuffisante pour publication.',
    });
    await expect(
      s.rev1.as.query(api.peerReview.getReviewQueue, PAGE),
    ).rejects.toThrow();
    const { page } = await s.editor.as.query(
      api.peerReview.getReviewQueue,
      PAGE,
    );
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({
      reviewStage: 'in_review',
      version: 1,
      aggregate: 'reject',
      authorName: AUTHOR_NAME,
      blindStatus: 'stripped',
    });
    expect(page[0].reviews.map((r) => r.reviewerName)).toEqual([
      'Rémi Relecteur',
      'Rita Relectrice',
    ]);
    expect(page[0].assignments.every((a) => a.reviewed)).toBe(true);
  });

  it('listOpenable, reviewStagesFor, listStaffUsers : rangs et contenu', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const member = await userWithRole(t, 'membre', 'm@test.org');
    await expect(
      s.rev1.as.query(api.peerReview.listOpenable, {}),
    ).rejects.toThrow();
    expect(
      (await s.editor.as.query(api.peerReview.listOpenable, {})).map(
        (p) => p._id,
      ),
    ).toEqual([s.pubId]);

    await expect(
      member.as.query(api.peerReview.reviewStagesFor, {
        publicationIds: [s.pubId],
      }),
    ).rejects.toThrow();
    expect(
      await s.rev1.as.query(api.peerReview.reviewStagesFor, {
        publicationIds: [s.pubId],
      }),
    ).toEqual([
      { publicationId: s.pubId, reviewStage: null, reviewerCount: 0 },
    ]);

    await expect(
      member.as.query(api.peerReview.listStaffUsers, {}),
    ).rejects.toThrow();
    const staff = await s.editor.as.query(api.peerReview.listStaffUsers, {});
    expect(staff.map((u) => u.email).sort()).toEqual([
      'eric@test.org',
      'remi@test.org',
      'rita@test.org',
    ]);
  });

  it('« Mes relectures » : SES assignations seulement, avis attendu signalé', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);
    const other = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'autre', title: 'Autre' })),
    );
    await s.editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: other,
      reviewerUserId: s.rev2.id,
    });
    const mine = await s.rev1.as.query(api.peerReview.myAssignments, {});
    expect(mine.map((a) => a.title)).toEqual([
      'Gouvernance numérique comparée',
    ]);
    expect(mine[0]).toMatchObject({
      open: true,
      conflict: 'clear',
      version: 1,
    });
    expect(
      (await s.rev2.as.query(api.peerReview.myAssignments, {})).map(
        (a) => a.title,
      ),
    ).toEqual(['Autre', 'Gouvernance numérique comparée']);
  });
});

describe('Données personnelles (suppression / export de compte)', () => {
  it('export puis suppression : auteur et relecteur', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);
    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'major',
      comment: 'Avis qui sera exporté puis supprimé.',
    });

    const reviewerExport = await t.run((ctx) =>
      exportUserDataEditorial(ctx, s.rev1.id),
    );
    expect(reviewerExport.reviews).toHaveLength(1);
    expect(reviewerExport.assignments).toHaveLength(1);
    const authorExport = await t.run((ctx) =>
      exportUserDataEditorial(ctx, s.author.id),
    );
    expect(authorExport.manuscriptVersions.map((v) => v.version)).toEqual([1]);

    await t.run((ctx) => deleteUserDataEditorial(ctx, s.rev1.id));
    const left = await t.run(async (ctx) => ({
      reviews: await ctx.db.query('peerReviews').collect(),
      assignments: await ctx.db.query('peerReviewAssignments').collect(),
    }));
    expect(left.reviews).toHaveLength(0);
    expect(left.assignments.map((a) => a.reviewerUserId)).toEqual([s.rev2.id]);

    await t.run((ctx) => deleteUserDataEditorial(ctx, s.author.id));
    const after = await t.run(async (ctx) => ({
      versions: await ctx.db.query('manuscriptVersions').collect(),
      assignments: await ctx.db.query('peerReviewAssignments').collect(),
    }));
    expect(after.versions).toHaveLength(0);
    // Unpublished manuscript: its review file goes with it.
    expect(after.assignments).toHaveLength(0);
  });
});

// Project convention: the term "démocratie libérale" / "liberal democracy"
// is BANNED from the strings the feature introduces.
describe('Peer review — contenu (terme banni)', () => {
  it('aucune chaîne F-43 ne contient « démocratie libérale » / « liberal democracy »', () => {
    const haystack = JSON.stringify([
      (frMessages as Record<string, unknown>).peerReview,
      (enMessages as Record<string, unknown>).peerReview,
      frMessages.notifications,
      enMessages.notifications,
    ]).toLowerCase();
    expect(haystack).not.toContain('démocratie libérale');
    expect(haystack).not.toContain('democratie liberale');
    expect(haystack).not.toContain('liberal democracy');
  });
});

describe('Décision d’un manuscrit — chef de revue et administrateur seulement (D-7)', () => {
  it('un éditeur sans la fonction ne peut pas décider, et rien n’est écrit', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);
    const plainEditor = await userWithRole(
      t,
      'editeur',
      'sans-fonction@test.org',
      'Éditeur sans fonction',
    );
    const before = await t.run(async (ctx) => ({
      decisions: (await ctx.db.query('manuscriptDecisions').collect()).length,
      audit: (await ctx.db.query('auditLog').collect()).length,
      notifications: (await ctx.db.query('notifications').collect()).length,
    }));

    for (const decision of ['accepted', 'rejected', 'revision'] as const) {
      await expect(
        plainEditor.as.mutation(api.peerReview.decideManuscript, {
          publicationId: s.pubId,
          decision,
          reason: REASON,
        }),
      ).rejects.toThrow(/chef de revue/);
    }

    const pub = await t.run((ctx) => ctx.db.get(s.pubId));
    expect(pub?.status).toBe('pending');
    expect(pub?.reviewStage).toBe('in_review');
    const after = await t.run(async (ctx) => ({
      decisions: (await ctx.db.query('manuscriptDecisions').collect()).length,
      audit: (await ctx.db.query('auditLog').collect()).length,
      notifications: (await ctx.db.query('notifications').collect()).length,
    }));
    expect(after).toEqual(before);
  });

  it('un administrateur peut décider', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await openWithTwoReviewers(t, s);
    const admin = await userWithRole(t, 'admin', 'admin@test.org', 'Admin');
    await s.rev1.as.mutation(api.peerReview.submitReview, {
      publicationId: s.pubId,
      recommendation: 'minor',
      comment: 'Quelques références manquent en section 3.',
    });

    await admin.as.mutation(api.peerReview.decideManuscript, {
      publicationId: s.pubId,
      decision: 'revision',
      reason: REASON,
    });
    expect((await t.run((ctx) => ctx.db.get(s.pubId)))?.reviewStage).toBe(
      'revision',
    );
  });

  it('les alertes de la rédaction vont aux chefs de revue et aux administrateurs', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const admin = await userWithRole(t, 'admin', 'admin@test.org', 'Admin');
    // `s.editor` holds the function; a plain editor does not.
    const plainEditor = await userWithRole(
      t,
      'editeur',
      'sans-fonction@test.org',
      'Éditeur sans fonction',
    );

    await s.author.as.mutation(api.peerReview.submitManuscript, {
      publicationId: s.pubId,
    });

    const notified = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'manuscriptSubmitted')
        .map((n) => n.userId),
    );
    expect(notified.sort()).toEqual([admin.id, s.editor.id].sort());
    expect(notified).not.toContain(plainEditor.id);
  });
});
