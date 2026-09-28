// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  ActionFeedbackProvider,
  useActionFeedback,
} from '@/components/admin/action-feedback';

afterEach(cleanup);

// Visible feedback after a back-office action (issue #38): the moderation
// screens displayed nothing, neither on success nor on server refusal. What is
// checked here is that the message lands in the RIGHT live region — a
// success announced politely, a failure announced immediately — because that is what
// decides whether it is announced to a screen reader, not merely painted.

function Harness() {
  const notify = useActionFeedback();
  return (
    <div>
      <button type="button" onClick={() => notify('Candidature rejetée.')}>
        succès
      </button>
      <button
        type="button"
        onClick={() => notify('Action non effectuée.', 'error')}
      >
        échec
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

describe('Retour d’action du back-office (issue #38)', () => {
  it('les deux régions live existent AVANT tout message', () => {
    setup();
    // A region added to the DOM at the same time as its text is not announced
    // reliably: they are therefore mounted empty.
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('un succès est annoncé poliment', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'succès' }));

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Candidature rejetée.');
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('un échec passe par la région assertive', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'échec' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Action non effectuée.',
    );
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('le message se ferme à la main', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'succès' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le message' }));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('un second message remplace le premier', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'succès' }));
    fireEvent.click(screen.getByRole('button', { name: 'échec' }));

    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toContain(
      'Action non effectuée.',
    );
  });
});
