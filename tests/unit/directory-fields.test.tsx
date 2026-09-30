// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import { DirectoryFields } from '@/components/admin/directory-fields';

// No global setupFiles in this project: @testing-library/react's automatic
// cleanup is not wired up. Without this cleanup, renders
// accumulate from one test to the next and labels become ambiguous.
afterEach(cleanup);

// Directory field input when approving an application (F-19/F-22).
// The stakes: approval now creates the directory profile, and the application
// only collects a country as free text. The form must therefore prevent an
// incomplete publication — otherwise we publish a profile with an empty region.

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

// The country is picked from a searchable list, by its name.
function pickCountry(search: string, name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Pays' }));
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Rechercher un pays' }),
    { target: { value: search } },
  );
  fireEvent.click(screen.getByRole('option', { name }));
}

// The region from a list of named regions (keyboard opening, as a
// keyboard user would).
function pickRegion(name: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Région' }), {
    key: 'Enter',
  });
  fireEvent.click(screen.getByRole('option', { name }));
}

function fillValidForm() {
  pickCountry('senegal', 'Sénégal');
  pickRegion("Afrique de l'Ouest");
  fireEvent.click(screen.getByLabelText('Gouvernance'));
}

const confirm = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Approuver et publier la fiche' }),
  );

describe("Fiche annuaire à l'approbation", () => {
  it('refuse de publier une fiche incomplète et le dit', () => {
    const { onConfirm } = setup();
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Renseignez un pays/);
  });

  it('exige au moins une thématique', () => {
    const { onConfirm } = setup();
    pickCountry('SN', 'Sénégal');
    pickRegion("Afrique de l'Ouest");
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('transmet une fiche complète, avec le code du pays choisi par son nom', () => {
    const { onConfirm } = setup();
    fillValidForm();
    confirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      countryCode: 'SN',
      region: 'afrique-ouest',
      themes: ['gouvernance'],
      languages: ['fr'],
    });
  });

  it('le pays écrit par le candidat est présélectionné quand il nomme un pays', () => {
    const { onConfirm } = setup({ countryText: 'côte d’ivoire' });
    // What the applicant wrote stays in view.
    expect(
      screen.getByText('La candidature indique : « côte d’ivoire ».'),
    ).toBeTruthy();
    expect(
      screen.getByRole('combobox', { name: 'Pays' }).textContent,
    ).toContain('Côte d’Ivoire');
    pickRegion("Afrique de l'Ouest");
    fireEvent.click(screen.getByLabelText('Gouvernance'));
    confirm();
    expect(onConfirm.mock.calls[0][0].countryCode).toBe('CI');
  });

  it('un texte qui ne nomme pas un pays ne présélectionne rien', () => {
    setup({ countryText: 'Afrique' });
    expect(
      screen.getByRole('combobox', { name: 'Pays' }).textContent,
    ).toContain('Choisir un pays');
  });

  it('régions et thématiques portent leur nom, pas leur identifiant', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Région' }), {
      key: 'Enter',
    });
    const regions = screen.getAllByRole('option').map((o) => o.textContent);
    expect(regions).toContain("Afrique de l'Ouest");
    expect(regions).not.toContain('afrique-ouest');
    expect(screen.getByLabelText('Élections & intégrité')).toBeTruthy();
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
      screen.getByRole('button', {
        name: 'Approuver et publier la fiche',
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole('button', {
        name: 'Approuver sans publier la fiche',
      }).disabled,
    ).toBe(true);
  });

  it('les thématiques se cochent et se décochent', () => {
    const { onConfirm } = setup();
    fillValidForm();
    fireEvent.click(screen.getByLabelText('Élections & intégrité'));
    fireEvent.click(screen.getByLabelText('Gouvernance')); // unchecks
    confirm();
    expect(onConfirm.mock.calls[0][0].themes).toEqual(['elections']);
  });
});
