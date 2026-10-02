// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { FIELD_MAX } from './lib/validation';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

async function member(
  t: TestConvex<typeof schema>,
  email: string,
  name?: string,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'membre', email, name }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const PROPOSAL = {
  theme: 'transitions',
  title: 'Observatoire des transitions',
  summary:
    'Un projet commun pour suivre les transitions démocratiques régionales.',
};

describe('Appels à projets — proposition (F-60)', () => {
  it('réserve la proposition aux membres et valide les champs', async () => {
    const t = convexTest(schema, modules);

    // anonymous refused
    await expect(
      t.mutation(api.projects.submitProject, PROPOSAL),
    ).rejects.toThrow();

    // visitor (account without member role) refused
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.projects.submitProject, PROPOSAL),
    ).rejects.toThrow();

    const { as } = await member(t, 'm@test.org', 'Awa Diop');
    // invalid axis
    await expect(
      as.mutation(api.projects.submitProject, {
        ...PROPOSAL,
        theme: 'inconnu',
      }),
    ).rejects.toThrow();
    // title too short (< 4)
    await expect(
      as.mutation(api.projects.submitProject, { ...PROPOSAL, title: 'ab' }),
    ).rejects.toThrow();
    // abstract too short (< 20)
    await expect(
      as.mutation(api.projects.submitProject, {
        ...PROPOSAL,
        summary: 'trop court',
      }),
    ).rejects.toThrow();

    // success -> pending, author name snapshot denormalized
    const res = await as.mutation(api.projects.submitProject, PROPOSAL);
    expect(res.ok).toBe(true);
    const rows = await t.run((ctx) =>
      ctx.db.query('projectProposals').collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].authorName).toBe('Awa Diop');
  });
});

describe('Appels à projets — back-office (F-60)', () => {
  it('liste et revue réservées au staff ; décision + audit', async () => {
    const t = convexTest(schema, modules);
    const author = await member(t, 'author@test.org', 'Auteur');
    await author.as.mutation(api.projects.submitProject, PROPOSAL);

    // the queue is reserved for moderators
    await expect(
      t.query(api.projects.listProjectProposals, {}),
    ).rejects.toThrow();
    await expect(
      author.as.query(api.projects.listProjectProposals, {}),
    ).rejects.toThrow();

    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const asMod = t.withIdentity({ subject: `${modId}|s` });

    // 'pending' filter returns the proposal
    const pending = await asMod.query(api.projects.listProjectProposals, {
      status: 'pending',
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('Observatoire des transitions');
    const proposalId = pending[0]._id;

    // a member cannot accept
    await expect(
      author.as.mutation(api.projects.reviewProjectProposal, {
        proposalId,
        decision: 'accepted',
      }),
    ).rejects.toThrow();

    // the moderator accepts with a note
    await asMod.mutation(api.projects.reviewProjectProposal, {
      proposalId,
      decision: 'accepted',
      notes: 'Beau projet.',
    });

    // nothing pending anymore; the proposal is accepted
    expect(
      (
        await asMod.query(api.projects.listProjectProposals, {
          status: 'pending',
        })
      ).length,
    ).toBe(0);
    const accepted = await asMod.query(api.projects.listProjectProposals, {
      status: 'accepted',
    });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].reviewNotes).toBe('Beau projet.');

    // an audit entry was written
    const audits = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'project.reviewed'))
        .collect(),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(modId);
  });
});

describe('Appels à projets — machine à états de la revue (issue #9)', () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const author = await member(t, 'author@test.org', 'Awa Diop');
    await author.as.mutation(api.projects.submitProject, PROPOSAL);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const [proposal] = await t.run((ctx) =>
      ctx.db.query('projectProposals').collect(),
    );
    return {
      t,
      author,
      modId,
      asMod: t.withIdentity({ subject: `${modId}|s` }),
      proposalId: proposal._id,
    };
  }

  const auditOf = (t: TestConvex<typeof schema>, action: string) =>
    t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', action))
        .collect(),
    );

  it('refuse le rejeu et l’inversion d’une décision', async () => {
    const { t, asMod, proposalId } = await setup();
    await asMod.mutation(api.projects.reviewProjectProposal, {
      proposalId,
      decision: 'accepted',
      notes: 'Beau projet.',
    });

    for (const decision of ['accepted', 'rejected'] as const) {
      await expect(
        asMod.mutation(api.projects.reviewProjectProposal, {
          proposalId,
          decision,
        }),
      ).rejects.toThrow('ALREADY_REVIEWED');
    }

    // Nothing moved, neither the proposal nor the log: the throw rolls back the
    // transaction before the audit write.
    const doc = await t.run((ctx) => ctx.db.get(proposalId));
    expect(doc?.status).toBe('accepted');
    expect(doc?.reviewNotes).toBe('Beau projet.');
    expect(await auditOf(t, 'project.reviewed')).toHaveLength(1);
  });

  it('réouverture : transition nommée, tracée, puis nouvelle décision', async () => {
    const { t, author, modId, asMod, proposalId } = await setup();
    await asMod.mutation(api.projects.reviewProjectProposal, {
      proposalId,
      decision: 'rejected',
    });

    // the author of the proposal does not reopen their own review
    await expect(
      author.as.mutation(api.projects.reopenProjectProposal, { proposalId }),
    ).rejects.toThrow();

    await asMod.mutation(api.projects.reopenProjectProposal, { proposalId });
    expect(await t.run((ctx) => ctx.db.get(proposalId))).toMatchObject({
      status: 'pending',
    });

    const reopened = await auditOf(t, 'project.reopened');
    expect(reopened).toHaveLength(1);
    expect(reopened[0].actorId).toBe(modId);
    expect(reopened[0].metadata).toMatchObject({ from: 'rejected' });

    // reopening a proposal that is already pending is pointless
    await expect(
      asMod.mutation(api.projects.reopenProjectProposal, { proposalId }),
    ).rejects.toThrow('INVALID_TRANSITION');

    // back in the queue, it is decided again — once.
    await asMod.mutation(api.projects.reviewProjectProposal, {
      proposalId,
      decision: 'accepted',
    });
    expect(await t.run((ctx) => ctx.db.get(proposalId))).toMatchObject({
      status: 'accepted',
    });
  });
});

// A-04: a 4,001-character abstract was refused under "Envoi impossible"
// — the code did not get through. It gets through (`data`), and the bound is the one
// the form displays (`FIELD_MAX.body`).
describe('Appels à projets — refus de longueur lisible (A-04)', () => {
  it('INVALID_SUMMARY porte son code dans `data`, la borne exacte passe', async () => {
    const t = convexTest(schema, modules);
    const { as } = await member(t, 'm@test.org');
    await expect(
      as.mutation(api.projects.submitProject, {
        ...PROPOSAL,
        summary: 'a'.repeat(FIELD_MAX.body + 1),
      }),
    ).rejects.toMatchObject({ data: 'INVALID_SUMMARY' });
    const r = await as.mutation(api.projects.submitProject, {
      ...PROPOSAL,
      summary: 'a'.repeat(FIELD_MAX.body),
    });
    expect(r.ok).toBe(true);
  });
});
