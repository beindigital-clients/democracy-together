// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

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
  t: ReturnType<typeof convexTest>,
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

    // anonyme refusé
    await expect(
      t.mutation(api.projects.submitProject, PROPOSAL),
    ).rejects.toThrow();

    // visiteur (compte sans rôle membre) refusé
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.projects.submitProject, PROPOSAL),
    ).rejects.toThrow();

    const { as } = await member(t, 'm@test.org', 'Awa Diop');
    // axe invalide
    await expect(
      as.mutation(api.projects.submitProject, {
        ...PROPOSAL,
        theme: 'inconnu',
      }),
    ).rejects.toThrow();
    // titre trop court (< 4)
    await expect(
      as.mutation(api.projects.submitProject, { ...PROPOSAL, title: 'ab' }),
    ).rejects.toThrow();
    // résumé trop court (< 20)
    await expect(
      as.mutation(api.projects.submitProject, {
        ...PROPOSAL,
        summary: 'trop court',
      }),
    ).rejects.toThrow();

    // succès -> en attente, nom d'auteur instantané dénormalisé
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

    // la file est réservée aux modérateurs
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

    // filtre 'pending' renvoie la proposition
    const pending = await asMod.query(api.projects.listProjectProposals, {
      status: 'pending',
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('Observatoire des transitions');
    const proposalId = pending[0]._id;

    // un membre ne peut pas accepter
    await expect(
      author.as.mutation(api.projects.reviewProjectProposal, {
        proposalId,
        decision: 'accepted',
      }),
    ).rejects.toThrow();

    // le modérateur accepte avec une note
    await asMod.mutation(api.projects.reviewProjectProposal, {
      proposalId,
      decision: 'accepted',
      notes: 'Beau projet.',
    });

    // plus rien en attente ; la proposition est acceptée
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

    // une entrée d'audit a été écrite
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

  const auditOf = (t: ReturnType<typeof convexTest>, action: string) =>
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

    // Rien n'a bougé, ni la proposition ni le journal : le throw annule la
    // transaction avant l'écriture d'audit.
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

    // l'auteur de la proposition ne rouvre pas sa propre revue
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

    // rouvrir une proposition déjà en attente n'a pas d'objet
    await expect(
      asMod.mutation(api.projects.reopenProjectProposal, { proposalId }),
    ).rejects.toThrow('INVALID_TRANSITION');

    // de retour dans la file, elle se tranche à nouveau — une fois.
    await asMod.mutation(api.projects.reviewProjectProposal, {
      proposalId,
      decision: 'accepted',
    });
    expect(await t.run((ctx) => ctx.db.get(proposalId))).toMatchObject({
      status: 'accepted',
    });
  });
});
