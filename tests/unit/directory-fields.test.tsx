// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import { DirectoryFields } from '@/components/admin/directory-fields';

// Pas de setupFiles global dans ce projet : le nettoyage automatique de
// @testing-library/react n'est pas branché. Sans ce cleanup, les rendus
// s'accumulent d'un test à l'autre et les libellés deviennent ambigus.
afterEach(cleanup);

// Saisie des champs d'annuaire à l'approbation d'une candidature (F-19/F-22).
// L'enjeu : l'approbation crée désormais la fiche annuaire, et la candidature
// ne collecte qu'un pays en texte libre. Le formulaire doit donc empêcher une
// publication incomplète — sinon on publie une fiche avec une région vide.

function setup(overrides: Partial<Parameters<typeof DirectoryFields>[0]> = {}) {
  const onConfirm = vi.fn();
  const onApproveWithout = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <DirectoryFields
        organizationName="Institut Démo Sahel"
        pending={false}
        onConfirm={onConfirm}
        onApproveWithout={onApproveWithout}
        onCancel={onCancel}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onApproveWithout, onCancel };
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Code pays (2 lettres)'), {
    target: { value: 'sn' },
  });
  fireEvent.change(screen.getByLabelText('Région'), {
    target: { value: 'afrique-ouest' },
  });
  fireEvent.click(screen.getByLabelText('gouvernance'));
}

describe("Fiche annuaire à l'approbation", () => {
  it('refuse de publier une fiche incomplète et le dit', () => {
    const { onConfirm } = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'Approuver et publier la fiche' }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(
      /Renseignez un code pays/,
    );
  });

  it('exige au moins une thématique', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText('Code pays (2 lettres)'), {
      target: { value: 'SN' },
    });
    fireEvent.change(screen.getByLabelText('Région'), {
      target: { value: 'afrique-ouest' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Approuver et publier la fiche' }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('transmet une fiche complète, code pays normalisé en majuscules', () => {
    const { onConfirm } = setup();
    fillValidForm();
    fireEvent.click(
      screen.getByRole('button', { name: 'Approuver et publier la fiche' }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      countryCode: 'SN',
      region: 'afrique-ouest',
      themes: ['gouvernance'],
      languages: ['fr'],
    });
  });

  it('permet d’approuver SANS publier la fiche (le compte est créé quand même)', () => {
    const { onApproveWithout, onConfirm } = setup();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Approuver sans publier la fiche',
      }),
    );
    expect(onApproveWithout).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('les boutons sont désactivés pendant la soumission', () => {
    setup({ pending: true });
    expect(
      (
        screen.getByRole('button', {
          name: 'Approuver et publier la fiche',
        })
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Approuver sans publier la fiche',
        })
      ).disabled,
    ).toBe(true);
  });

  it('les thématiques se cochent et se décochent', () => {
    const { onConfirm } = setup();
    fillValidForm();
    fireEvent.click(screen.getByLabelText('elections'));
    fireEvent.click(screen.getByLabelText('gouvernance')); // décoche
    fireEvent.click(
      screen.getByRole('button', { name: 'Approuver et publier la fiche' }),
    );
    expect(onConfirm.mock.calls[0][0].themes).toEqual(['elections']);
  });
});
