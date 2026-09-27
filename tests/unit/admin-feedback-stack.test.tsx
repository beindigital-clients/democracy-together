// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  act,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  ActionFeedbackProvider,
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// PLUSIEURS RETOURS À LA FOIS (campagne du 27/09, C-5). Un seul message était
// retenu : « rejetée » puis « Rouvrir » laissait le premier seul à l'écran,
// à lire à l'envers. Ce fichier tient les trois règles de l'empilement :
// les succès s'additionnent, un échec évince les succès, et chaque message
// se ferme pour lui-même. `tests/unit/action-feedback.test.tsx` garde, lui,
// le contrat des régions live — il n'a pas bougé.

function Harness() {
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  return (
    <div>
      <button type="button" onClick={() => notify('Publication rejetée.')}>
        rejet
      </button>
      <button type="button" onClick={() => notify('Publication rouverte.')}>
        réouverture
      </button>
      <button type="button" onClick={() => notify('Refus.', 'error')}>
        échec
      </button>
      <button
        type="button"
        onClick={() =>
          fail(new Error('Server Error\nUncaught Error: ALREADY_REVIEWED'))
        }
      >
        refus serveur
      </button>
    </div>
  );
}

function setup() {
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <ActionFeedbackProvider>
        <Harness />
      </ActionFeedbackProvider>
    </NextIntlClientProvider>,
  );
}

describe('Retours d’action empilés (27/09, C-5)', () => {
  it('deux succès rapprochés restent visibles tous les deux', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'rejet' }));
    fireEvent.click(screen.getByRole('button', { name: 'réouverture' }));

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Publication rejetée.');
    expect(status.textContent).toContain('Publication rouverte.');
    expect(
      within(status).getAllByRole('button', { name: 'Fermer le message' }),
    ).toHaveLength(2);
  });

  it('fermer un message ne ferme que lui', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'rejet' }));
    fireEvent.click(screen.getByRole('button', { name: 'réouverture' }));
    const status = screen.getByRole('status');
    fireEvent.click(
      within(status).getAllByRole('button', { name: 'Fermer le message' })[0],
    );
    expect(status.textContent).not.toContain('Publication rejetée.');
    expect(status.textContent).toContain('Publication rouverte.');
  });

  it('un échec évince les succès encore affichés, pas les autres échecs', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'rejet' }));
    fireEvent.click(screen.getByRole('button', { name: 'échec' }));
    fireEvent.click(screen.getByRole('button', { name: 'échec' }));

    expect(screen.getByRole('status').textContent).toBe('');
    expect(
      within(screen.getByRole('alert')).getAllByRole('button', {
        name: 'Fermer le message',
      }),
    ).toHaveLength(2);
  });

  it('chaque message part de lui-même après son délai', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'rejet' }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'réouverture' }));
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    const status = screen.getByRole('status');
    expect(status.textContent).not.toContain('Publication rejetée.');
    expect(status.textContent).toContain('Publication rouverte.');
  });

  it('un refus serveur est traduit par son code (R-08)', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'refus serveur' }));
    expect(screen.getByRole('alert').textContent).toBe(
      messages.admin.feedbackErr_ALREADY_REVIEWED,
    );
  });
});
