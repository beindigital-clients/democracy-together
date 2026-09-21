// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Pas de setupFiles global dans ce projet : le nettoyage automatique de
// @testing-library/react n'est pas branché (cf. directory-fields.test.tsx).
afterEach(cleanup);

// Boîte de confirmation des actions irréversibles du back-office (issue #38).
// Ce qui est vérifié ici n'est pas l'apparence mais les QUATRE propriétés qui
// font d'elle un garde-fou : elle nomme sa cible, elle n'agit que sur une
// validation explicite, elle est pilotable au clavier, et elle est annoncée
// comme un dialogue modal.

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

    // La propriété qui compte n'est pas « createPortal est appelé » : c'est que
    // le dialogue ne vit PLUS sous le conteneur de son appelant. Un `fixed`
    // rendu en place s'ancre au premier ancêtre portant `transform`, `filter`
    // ou `perspective` — trois propriétés qu'un composant voisin peut gagner
    // à tout moment, sans rapport visible avec cette boîte. Le jour où cela
    // arrive, elle est mal placée pour les UTILISATEURS.
    expect(container.contains(dialogue)).toBe(false);
    expect(document.body.contains(dialogue)).toBe(true);
  });

  it('le focus va toujours sur « Annuler » malgré le rendu différé', () => {
    // Le portail impose d'attendre le montage (`document` n'existe pas au rendu
    // serveur), donc le premier rendu ne produit rien. L'effet de focus doit
    // se rejouer ensuite — sans quoi une touche Entrée retombe sur l'action
    // destructrice, ce que cette boîte existe pour empêcher.
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
    // La description est rattachée, pas seulement affichée à côté.
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
    // L'arrière-plan est un bouton masqué aux technologies d'assistance : on
    // le prend par son rôle DOM, puisqu'il n'en a volontairement aucun pour
    // les lecteurs d'écran.
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
