// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import { RoleSelector } from '@/components/admin/role-selector';

afterEach(cleanup);

// Sélecteur de rôle du back-office (issue #38).
//
// Le `onChange` du `<Select>` déclenchait la mutation : un mouvement de molette
// au-dessus de la liste déroulante rétrogradait un modérateur. Le cœur de ce
// fichier est donc le premier test — CHOISIR N'EST PAS APPLIQUER — puis le
// second garde-fou, la confirmation qui nomme le compte visé.

function setup(
  overrides: Partial<Parameters<typeof RoleSelector>[0]> = {},
  applied = true,
) {
  const onApply = vi.fn().mockResolvedValue(applied);
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <RoleSelector
        name="moderateur@democracytogether.test"
        role="moderateur"
        onApply={onApply}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onApply };
}

const select = () =>
  screen.getByLabelText<HTMLSelectElement>(
    'Rôle moderateur@democracytogether.test',
  );

function choose(role: string) {
  fireEvent.change(select(), { target: { value: role } });
}

describe('RoleSelector — choisir n’est pas appliquer (issue #38)', () => {
  it('changer la valeur du sélecteur n’envoie RIEN', () => {
    const { onApply } = setup();
    choose('membre');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('« Appliquer » n’apparaît qu’une fois la valeur changée, et disparaît si on revient en arrière', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Appliquer/ })).toBeNull();

    choose('membre');
    expect(screen.getByRole('button', { name: /Appliquer/ })).toBeTruthy();

    choose('moderateur'); // retour à la valeur réelle
    expect(screen.queryByRole('button', { name: /Appliquer/ })).toBeNull();
  });

  it('« Appliquer » ouvre une confirmation qui NOMME le compte et le changement', () => {
    const { onApply } = setup();
    choose('membre');
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }));

    const dialog = screen.getByRole('dialog', {
      name: 'Changer le rôle de moderateur@democracytogether.test ?',
    });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('« Modérateur »');
    expect(dialog.textContent).toContain('« Membre »');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('annuler la confirmation n’applique pas le rôle', () => {
    const { onApply } = setup();
    choose('membre');
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Le brouillon survit à l'annulation : on rouvre sans re-choisir.
    expect(screen.getByRole('button', { name: /Appliquer/ })).toBeTruthy();
  });

  it('confirmer applique le rôle CHOISI, une seule fois', async () => {
    const { onApply } = setup();
    choose('visiteur');
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Changer le rôle' }));
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('visiteur');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un refus du serveur ramène le sélecteur à la valeur réelle', async () => {
    setup({}, false);
    choose('visiteur');
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Changer le rôle' }));
    });

    expect(select().value).toBe('moderateur');
    expect(screen.queryByRole('button', { name: /Appliquer/ })).toBeNull();
  });

  it('le compte verrouillé (soi-même) ne peut même pas être préparé', () => {
    setup({ locked: true, lockedReason: 'Vous ne pouvez pas…' });
    expect(select().disabled).toBe(true);
  });
});
