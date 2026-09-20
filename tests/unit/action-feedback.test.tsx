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

// Retour visible après une action de back-office (issue #38) : les écrans de
// modération n'affichaient rien, ni au succès ni au refus serveur. Ce qui est
// vérifié ici, c'est que le message atterrit dans la BONNE région live — un
// succès annoncé poliment, un échec annoncé tout de suite — parce que c'est ce
// qui décide s'il est annoncé à un lecteur d'écran, pas seulement peint.

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
    // Une région ajoutée au DOM en même temps que son texte n'est pas annoncée
    // de façon fiable : elles sont donc montées vides.
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
