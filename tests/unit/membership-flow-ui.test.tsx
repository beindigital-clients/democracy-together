// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';

// THE MEMBERSHIP FLOW, AS THE TWO PEOPLE IN IT SEE IT (F-22 / F-26).
//
// The applicant: after "Envoyer", the screen said "we will get back to you by
// e-mail" and nothing else — no address to check, no idea of what comes next,
// while e-mail is their only channel (no account before approval).
//
// The moderator: nothing in the menu said an application was waiting, the
// queue showed no date, and an approved member whose invitation never left
// could not be told again from there.

afterEach(cleanup);

type ConvexFake = {
  queries: Map<string, unknown>;
  page: { results: unknown[]; status: 'Exhausted' };
  // Arguments of each mutation/action call, in order.
  calls: { args: unknown }[];
  // What the next mutation/action call resolves to.
  result: unknown;
};

const convex = vi.hoisted((): ConvexFake => ({
  queries: new Map(),
  page: { results: [], status: 'Exhausted' },
  calls: [],
  result: undefined,
}));

vi.mock('convex/react', async () => {
  const { getFunctionName } = await import('convex/server');
  const call = (args: unknown) => {
    convex.calls.push({ args });
    return Promise.resolve(convex.result);
  };
  return {
    useQuery: (ref: unknown, args: unknown) =>
      args === 'skip'
        ? undefined
        : convex.queries.get(getFunctionName(ref as never)),
    useMutation: () => call,
    useAction: () => call,
    usePaginatedQuery: () => ({ ...convex.page, loadMore: () => {} }),
  };
});

// The anti-robot check is not the subject here.
vi.mock('@/lib/recaptcha', () => ({
  useRecaptcha: () => () => Promise.resolve('jeton'),
}));

const { MembershipForm } =
  await import('@/components/membership/membership-form');
const { AdminNav } = await import('@/components/admin/admin-nav');
const { ActionFeedbackProvider } =
  await import('@/components/admin/action-feedback');
const { default: AdminApplications } =
  await import('@/app/[locale]/admin/candidatures/page');

function withIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  convex.queries.clear();
  convex.calls = [];
  convex.result = undefined;
  convex.page = { results: [], status: 'Exhausted' };
});

describe('Candidat — après « Envoyer ma candidature »', () => {
  function fill(email: string) {
    fireEvent.change(screen.getByLabelText(/Nom du think tank/), {
      target: { value: 'Institut Démo Sahel' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail de contact/), {
      target: { value: email },
    });
    fireEvent.change(screen.getByLabelText(/^Pays/), {
      target: { value: 'Sénégal' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Envoyer ma candidature' }),
    );
  }

  it('montre l’adresse où part la confirmation, puis la suite du parcours', async () => {
    withIntl(<MembershipForm />);
    fill('  contact@institut-sahel.org ');

    const status = await screen.findByRole('status');
    expect(
      within(status).getByRole('heading', { name: 'Candidature reçue' }),
    ).toBeTruthy();
    // The address as it will be written to — trimmed, on its own line.
    expect(within(status).getByText('contact@institut-sahel.org')).toBeTruthy();

    const steps = screen.getByRole('list');
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      '1Notre comité examine votre candidature.',
      '2Vous recevez sa réponse par e-mail, à cette adresse.',
      '3Si elle est acceptée, ce message contient le lien pour vous connecter à votre espace membre.',
    ]);
    expect(
      screen
        .getByRole('link', { name: /Découvrir le réseau/ })
        .getAttribute('href'),
    ).toBe('/fr/le-reseau');

    expect(convex.calls).toHaveLength(1);
    expect(convex.calls[0].args).toMatchObject({
      contactEmail: 'contact@institut-sahel.org',
      locale: 'fr',
    });
  });

  it('le nom d’un chercheur se remplit comme un nom de personne', () => {
    withIntl(<MembershipForm />);
    expect(
      screen.getByLabelText(/Nom du think tank/).getAttribute('autocomplete'),
    ).toBe('organization');
    fireEvent.click(screen.getByLabelText('Chercheur / individuel'));
    expect(
      screen.getByLabelText(/Nom et prénom/).getAttribute('autocomplete'),
    ).toBe('name');
  });
});

describe('Équipe — le menu dit où le travail attend', () => {
  function nav(counts: Record<string, number | undefined>) {
    withIntl(
      <AdminNav role="admin" pathname="/admin/journal" counts={counts} />,
    );
    return screen.getByRole('navigation', { name: 'Administration' });
  }

  it('une pastille sur « Candidatures », décrite, sans changer le nom du lien', () => {
    const bar = nav({ applications: 3 });
    const link = within(bar).getByRole('link', {
      name: 'Candidatures (Administration)',
    });
    expect(link.textContent).toBe('Candidatures3');
    const describedBy = link.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'En attente : 3',
    );
  });

  it('rien quand rien n’attend', () => {
    const bar = nav({ applications: 0, publications: undefined });
    for (const name of [
      'Candidatures (Administration)',
      'Publications (Administration)',
    ]) {
      const link = within(bar).getByRole('link', { name });
      expect(link.getAttribute('aria-describedby')).toBeNull();
    }
  });
});

describe('Équipe — la file des candidatures', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const base = {
    type: 'organisation' as const,
    country: 'Sénégal',
    message: null,
    reviewNotes: null,
    applicantEmail: null,
    applicantRole: null,
    reopenedAt: null,
    reopenedFrom: null,
    organizationStatus: null,
  };

  function queue(results: unknown[]) {
    convex.page = { results, status: 'Exhausted' };
    return withIntl(
      <ActionFeedbackProvider>
        <AdminApplications />
      </ActionFeedbackProvider>,
    );
  }

  it('date, attente, adresse cliquable et note présentée comme interne', () => {
    queue([
      {
        ...base,
        _id: 'a1',
        organizationName: 'Institut Ancien',
        contactEmail: 'ancien@institut.org',
        status: 'pending',
        submittedAt: Date.now() - 10 * DAY,
        reviewedAt: null,
        invitedAt: null,
      },
    ]);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(/^Reçue le /)).toBeTruthy();
    // Ten days: highlighted, the applicant has been waiting that long.
    const waited = within(row).getByText('il y a 10 jours');
    expect(waited.className).toContain('text-accent-text');
    expect(
      within(row)
        .getByRole('link', { name: 'ancien@institut.org' })
        .getAttribute('href'),
    ).toBe('mailto:ancien@institut.org');
    expect(
      within(row).getByPlaceholderText('Note interne (optionnelle)'),
    ).toBeTruthy();
  });

  it('approuvée sans invitation partie : l’écran le dit et propose de l’envoyer', async () => {
    convex.result = { email: 'contact@institut.org', emailMode: 'configured' };
    queue([
      {
        ...base,
        _id: 'a2',
        organizationName: 'Institut Validé',
        contactEmail: 'contact@institut.org',
        status: 'approved',
        submittedAt: Date.now() - 2 * DAY,
        reviewedAt: Date.now() - DAY,
        invitedAt: null,
      },
    ]);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(/^Décidée le /)).toBeTruthy();
    expect(
      within(row).getByText('Invitation à se connecter pas encore envoyée.'),
    ).toBeTruthy();

    fireEvent.click(
      within(row).getByRole('button', { name: 'Envoyer l’invitation' }),
    );
    await waitFor(() => expect(convex.calls).toHaveLength(1));
    expect(convex.calls[0].args).toEqual({ applicationId: 'a2' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Invitation en cours d’envoi à contact@institut.org.',
      ),
    );
  });

  it('sans fournisseur d’e-mail, le renvoi prévient au lieu d’annoncer un envoi', async () => {
    convex.result = { email: 'contact@institut.org', emailMode: 'none' };
    queue([
      {
        ...base,
        _id: 'a3',
        organizationName: 'Institut Invité',
        contactEmail: 'contact@institut.org',
        status: 'approved',
        submittedAt: Date.now() - 2 * DAY,
        reviewedAt: Date.now() - DAY,
        invitedAt: Date.now() - DAY,
      },
    ]);
    const row = screen.getByRole('listitem');
    expect(
      within(row).getByText(/^Invitation à se connecter envoyée le /),
    ).toBeTruthy();
    fireEvent.click(
      within(row).getByRole('button', { name: 'Renvoyer l’invitation' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'aucun fournisseur d',
      ),
    );
  });
});

// GOING BACK ON A DECISION (issue #9). The rejection dialog said the decision
// was final, and the queue offered nothing on a decided application. A
// rejection is now rescued in one click; an approval goes through a
// confirmation that says what the server will take back.
describe('Équipe — revenir sur une décision', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const decided = {
    type: 'organisation' as const,
    country: 'Sénégal',
    message: null,
    reviewNotes: null,
    applicantEmail: 'contact@institut.org',
    applicantRole: 'membre' as const,
    contactEmail: 'contact@institut.org',
    submittedAt: Date.now() - 5 * DAY,
    reviewedAt: Date.now() - DAY,
    invitedAt: Date.now() - DAY,
    reopenedAt: null,
    reopenedFrom: null,
    organizationStatus: 'active' as const,
  };

  function queue(results: unknown[]) {
    convex.page = { results, status: 'Exhausted' };
    return withIntl(
      <ActionFeedbackProvider>
        <AdminApplications />
      </ActionFeedbackProvider>,
    );
  }

  it('une candidature rejetée se repêche en un clic', async () => {
    convex.result = {
      roleWithdrawn: false,
      organizationSuspended: false,
      accountNotified: false,
    };
    queue([
      {
        ...decided,
        _id: 'r1',
        organizationName: 'Institut Écarté',
        status: 'rejected',
        applicantEmail: null,
        applicantRole: null,
        invitedAt: null,
        organizationStatus: null,
      },
    ]);
    const row = screen.getByRole('listitem');
    fireEvent.click(
      within(row).getByRole('button', { name: 'Remettre en étude' }),
    );

    // Nothing to take back: no confirmation to get through.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(convex.calls).toHaveLength(1));
    expect(convex.calls[0].args).toEqual({ applicationId: 'r1' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Candidature de Institut Écarté remise en étude.',
      ),
    );
  });

  it('une candidature approuvée passe par une confirmation qui dit ce qui sera retiré', async () => {
    convex.queries.set('organizations:reopenImpact', {
      member: {
        email: 'contact@institut.org',
        role: 'membre',
        losesRole: true,
      },
      organization: { name: 'Institut Validé' },
      colleagues: ['collegue@institut.org'],
      colleaguesTotal: 1,
    });
    convex.result = {
      roleWithdrawn: true,
      organizationSuspended: true,
      accountNotified: true,
    };
    queue([
      {
        ...decided,
        _id: 'a1',
        organizationName: 'Institut Validé',
        status: 'approved',
      },
    ]);
    const row = screen.getByRole('listitem');
    fireEvent.click(
      within(row).getByRole('button', { name: 'Remettre en étude' }),
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Remettre en étude la candidature de Institut Validé ?',
    });
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'le compte contact@institut.org perd son rôle de membre ;',
      'la fiche « Institut Validé » sort de l’annuaire, et son responsable ne peut plus la modifier ni y inviter de collègues ;',
      'un autre compte rattaché à la fiche garde son rôle de membre : collegue@institut.org — revoyez-le au besoin dans Utilisateurs.',
    ]);
    // And who is told: the member account, in the app.
    expect(dialog.textContent).toContain(
      'Le compte contact@institut.org est prévenu que la candidature est de nouveau à l’étude',
    );
    // Nothing happens before the confirmation.
    expect(convex.calls).toHaveLength(0);

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remettre en étude' }),
    );
    await waitFor(() => expect(convex.calls).toHaveLength(1));
    expect(convex.calls[0].args).toEqual({ applicationId: 'a1' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Candidature de Institut Validé remise en étude. Son compte n’a plus le rôle de membre. Sa fiche est retirée de l’annuaire. Le candidat en est prévenu dans son espace.',
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un compte qui ne tient pas son rôle de cette approbation le garde, et l’écran le dit', () => {
    convex.queries.set('organizations:reopenImpact', {
      member: {
        email: 'directrice@institut.org',
        role: 'editeur',
        losesRole: false,
      },
      organization: null,
      colleagues: [],
      colleaguesTotal: 0,
    });
    queue([
      {
        ...decided,
        _id: 'a2',
        type: 'individu',
        organizationName: 'Awa Diop',
        status: 'approved',
        organizationStatus: null,
      },
    ]);
    fireEvent.click(
      within(screen.getByRole('listitem')).getByRole('button', {
        name: 'Remettre en étude',
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'le compte directrice@institut.org garde son rôle (Éditeur) : il ne le tient pas de cette seule approbation ;',
    ]);
  });

  it('sans compte à prévenir, la confirmation dit que personne ne l’est', () => {
    // The account the approval opened was deleted since.
    convex.queries.set('organizations:reopenImpact', {
      member: null,
      organization: null,
      colleagues: [],
      colleaguesTotal: 0,
    });
    queue([
      {
        ...decided,
        _id: 'a3',
        type: 'individu',
        organizationName: 'Compte disparu',
        status: 'approved',
        applicantEmail: null,
        applicantRole: null,
        organizationStatus: null,
      },
    ]);
    fireEvent.click(
      within(screen.getByRole('listitem')).getByRole('button', {
        name: 'Remettre en étude',
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Personne n’est prévenu maintenant');
    expect(dialog.textContent).not.toContain('est prévenu que la candidature');
  });

  it('remise en étude : la décision précédente reste lisible, et la fiche existante n’est pas ressaisie', async () => {
    convex.result = { userCreated: false, organizationId: 'o1' };
    queue([
      {
        ...decided,
        _id: 'p1',
        organizationName: 'Institut Revu',
        status: 'pending',
        reviewNotes: 'Statuts à vérifier.',
        invitedAt: null,
        reopenedAt: Date.now() - 60_000,
        reopenedFrom: 'approved',
        organizationStatus: 'suspended',
      },
    ]);
    const row = screen.getByRole('listitem');
    expect(
      within(row).getByText(
        /^Remise en étude le .+ : elle avait été approuvée\.$/,
      ),
    ).toBeTruthy();
    expect(
      within(row).getByText(
        'Note de la décision précédente : « Statuts à vérifier. »',
      ),
    ).toBeTruthy();
    expect(
      within(row).getByText(
        'Approuver rétablit la fiche d’annuaire créée à la première approbation, sans la ressaisir.',
      ),
    ).toBeTruthy();

    // The entry exists: approving decides at once, without the entry form.
    fireEvent.click(within(row).getByRole('button', { name: 'Approuver' }));
    expect(within(row).queryByRole('heading', { name: 'Fiche annuaire' })).toBe(
      null,
    );
    await waitFor(() => expect(convex.calls).toHaveLength(1));
    expect(convex.calls[0].args).toEqual({
      applicationId: 'p1',
      decision: 'approved',
    });
  });

  it('le refus ne se dit plus définitif', () => {
    queue([
      {
        ...decided,
        _id: 'p2',
        organizationName: 'Institut Nouveau',
        status: 'pending',
        applicantEmail: null,
        applicantRole: null,
        reviewedAt: null,
        invitedAt: null,
        organizationStatus: null,
      },
    ]);
    fireEvent.click(
      within(screen.getByRole('listitem')).getByRole('button', {
        name: 'Rejeter',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Rejeter la candidature de Institut Nouveau ?',
    });
    expect(dialog.textContent).toContain(
      'Vous pourrez revenir sur ce refus en remettant la candidature en étude.',
    );
    expect(dialog.textContent).not.toContain('définitive');
  });
});
