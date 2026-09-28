// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// No global setupFiles in this project: @testing-library/react's automatic
// cleanup is not wired up (see directory-fields.test.tsx).
afterEach(cleanup);

// Confirmation box for irreversible back-office actions (issue #38).
// What is checked here is not the appearance but the FOUR properties that
// make it a safeguard: it names its target, it only acts on an
// explicit confirmation, it is keyboard-operable, and it is announced
// as a modal dialog.

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog
      open
      title="Rejeter la candidature de Institut Démo Sahel ?"
      description="La décision est définitive."
      confirmLabel="Rejeter la candidature"
      cancelLabel="Annuler"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel, ...utils };
}

describe('ConfirmDialog — rendu par PORTAIL (audit F-13)', () => {
  it('le dialogue est monté sur document.body, hors de l’arbre d’appel', () => {
    const { container } = setup();
    const dialogue = screen.getByRole('dialog');

    // The property that matters is not "createPortal is called": it is that
    // the dialog NO LONGER lives under its caller's container. A `fixed`
    // rendered in place anchors to the first ancestor carrying `transform`, `filter`
    // or `perspective` — three properties a neighboring component can acquire
    // at any time, with no visible connection to this box. The day that
    // happens, it is misplaced for USERS.
    expect(container.contains(dialogue)).toBe(false);
    expect(document.body.contains(dialogue)).toBe(true);
  });

  it('le focus va toujours sur « Annuler » malgré le rendu différé', () => {
    // The portal requires waiting for mount (`document` does not exist during server
    // render), so the first render produces nothing. The focus effect must
    // replay afterwards — otherwise an Enter keypress falls back on the
    // destructive action, which this box exists to prevent.
    setup();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Annuler' }),
    );
  });
});

describe('ConfirmDialog (issue #38)', () => {
  it('ne rend rien tant qu’elle est fermée', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('est un dialogue modal NOMMÉ par son titre, et décrit', () => {
    setup();
    const dialog = screen.getByRole('dialog', {
      name: 'Rejeter la candidature de Institut Démo Sahel ?',
    });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The description is attached, not merely displayed alongside.
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'La décision est définitive.',
    );
  });

  it('n’agit pas tant que la validation n’est pas cliquée', () => {
    const { onConfirm } = setup();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Rejeter la candidature' }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('annule au bouton, à Échap et au clic hors zone — sans jamais confirmer', () => {
    const { onConfirm, onCancel } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    // The backdrop is a button hidden from assistive technologies: we
    // grab it by its DOM role, since it deliberately has none for
    // screen readers.
    const overlay = document.querySelector('button[aria-hidden="true"]');
    fireEvent.click(overlay!);

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ouvre le focus sur l’ANNULATION (une touche Entrée ne détruit rien)', () => {
    setup();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Annuler' }),
    );
  });

  it('rend le focus au déclencheur à la fermeture', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <ConfirmDialog
        open
        title="Retirer ce commentaire de la tribune ?"
        confirmLabel="Retirer le contenu"
        cancelLabel="Annuler"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Annuler' }),
    );

    rerender(
      <ConfirmDialog
        open={false}
        title="Retirer ce commentaire de la tribune ?"
        confirmLabel="Retirer le contenu"
        cancelLabel="Annuler"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('piège le focus : Tab depuis la dernière issue revient à la première', () => {
    setup();
    const cancel = screen.getByRole('button', { name: 'Annuler' });
    const confirm = screen.getByRole('button', {
      name: 'Rejeter la candidature',
    });

    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('pendant l’appel : les deux issues sont neutralisées, Échap ne ferme pas', () => {
    const { onCancel } = setup({ pending: true });
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Annuler' })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Rejeter la candidature',
      }).disabled,
    ).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
