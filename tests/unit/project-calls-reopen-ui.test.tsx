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

// GOING BACK ON A CALL-FOR-PROJECTS DECISION (F-60, issue #9), on the ranking
// the moderator decides from. A selection or a refusal used to be final — the
// decision dialog said so — and a decided project offered nothing. It is now
// put back under review, through a confirmation that says the applicant is
// told; while it waits for its new decision, the previous one stays in sight.

afterEach(cleanup);

type ConvexFake = {
  queries: Map<string, unknown>;
  // Arguments of each mutation call, in order.
  calls: { args: unknown }[];
};

const convex = vi.hoisted((): ConvexFake => ({
  queries: new Map(),
  calls: [],
}));

vi.mock('convex/react', async () => {
  const { getFunctionName } = await import('convex/server');
  const call = (args: unknown) => {
    convex.calls.push({ args });
    return Promise.resolve(null);
  };
  return {
    useQuery: (ref: unknown, args: unknown) =>
      args === 'skip'
        ? undefined
        : convex.queries.get(getFunctionName(ref as never)),
    useMutation: () => call,
    useAction: () => call,
  };
});

const { ActionFeedbackProvider } =
  await import('@/components/admin/action-feedback');
const { default: AdminProjectCalls } =
  await import('@/app/[locale]/admin/projets/appels/page');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const CALL = {
  _id: 'c1',
  slug: 'fonds-participation',
  title: 'Fonds participation',
  summary: 'Soutenir des projets de recherche-action sur la participation.',
  opensAt: NOW - 10 * DAY,
  closesAt: NOW - DAY,
  timeZone: 'UTC',
  fundAmount: 50000,
  fundCurrency: 'EUR',
  themes: [],
  languages: ['fr'],
  criteria: [],
  requiredDocuments: [],
  status: 'published',
  applications: 1,
  evaluators: [],
};

const ROW = {
  rank: 1,
  average: 80,
  evaluations: 1,
  excluded: 0,
  summary: 'Un projet de recherche-action sur la participation.',
  applicantName: 'Awa Diop',
  decisionNote: null,
  reopenedAt: null,
  reopenedFrom: null,
  attachments: [],
};

beforeEach(() => {
  convex.queries.clear();
  convex.calls = [];
});

// The ranking of the one call, opened as the moderator opens it.
function ranking(rows: unknown[]) {
  convex.queries.set('projectCalls:adminListCalls', [CALL]);
  convex.queries.set('projectCalls:callRanking', rows);
  render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <ActionFeedbackProvider>
        <AdminProjectCalls />
      </ActionFeedbackProvider>
    </NextIntlClientProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Classement et décisions' }),
  );
}

// A ranked project's row — the innermost list item carrying its title.
function row(title: string) {
  return screen.getByText(title).closest('li')!;
}

describe('Classement d’un appel — revenir sur une décision', () => {
  it('un projet sélectionné se remet en étude, après une confirmation qui le nomme', async () => {
    ranking([
      {
        ...ROW,
        _id: 'a1',
        title: 'Observatoire citoyen',
        status: 'selected',
        decisionNote: 'Félicitations.',
      },
    ]);
    const r = within(row('Observatoire citoyen'));
    // A selection is no longer re-decided in place...
    expect(r.queryByRole('button', { name: 'Ne pas retenir' })).toBeNull();
    // ...it is put back under review.
    fireEvent.click(r.getByRole('button', { name: 'Remettre en étude' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Remettre en étude « Observatoire citoyen » ?',
    });
    expect(dialog.textContent).toContain(
      'Le porteur est notifié que son dossier est de nouveau à l’étude',
    );
    expect(convex.calls).toHaveLength(0);

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remettre en étude' }),
    );
    await waitFor(() => expect(convex.calls).toHaveLength(1));
    expect(convex.calls[0].args).toEqual({ applicationId: 'a1' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        '« Observatoire citoyen » est de nouveau à l’étude. Le porteur est notifié.',
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('liste d’attente : elle avance toujours, et se remet en étude aussi', () => {
    ranking([
      { ...ROW, _id: 'a2', title: 'Radio citoyenne', status: 'waitlisted' },
    ]);
    const r = within(row('Radio citoyenne'));
    for (const name of [
      'Sélectionner',
      'Ne pas retenir',
      'Remettre en étude',
    ]) {
      expect(r.getByRole('button', { name })).toBeTruthy();
    }
    expect(r.queryByRole('button', { name: 'Liste d’attente' })).toBeNull();
  });

  it('remis en étude : la décision précédente et sa note restent lisibles', () => {
    ranking([
      {
        ...ROW,
        _id: 'a3',
        title: 'Atlas des conseils municipaux',
        status: 'submitted',
        decisionNote: 'Félicitations.',
        reopenedAt: NOW - 60_000,
        reopenedFrom: 'selected',
      },
    ]);
    const r = within(row('Atlas des conseils municipaux'));
    expect(
      r.getByText(/^Remis en étude le .+ : il avait été sélectionné\.$/),
    ).toBeTruthy();
    expect(
      r.getByText('Note de la décision précédente : Félicitations.'),
    ).toBeTruthy();
    // Back among those to decide: the decisions, not a second reopening.
    expect(r.getByRole('button', { name: 'Sélectionner' })).toBeTruthy();
    expect(r.queryByRole('button', { name: 'Remettre en étude' })).toBeNull();
  });

  it('la confirmation d’une décision ne la dit plus définitive', () => {
    ranking([
      { ...ROW, _id: 'a4', title: 'Fabrique du débat', status: 'submitted' },
    ]);
    fireEvent.click(
      within(row('Fabrique du débat')).getByRole('button', {
        name: 'Sélectionner',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Sélectionner : « Fabrique du débat » ?',
    });
    expect(dialog.textContent).toContain(
      'Vous pourrez revenir dessus en remettant le dossier en étude.',
    );
    expect(dialog.textContent).not.toContain('définitif');
  });
});
