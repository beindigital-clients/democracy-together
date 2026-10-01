// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  Field,
  FormError,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';
import { chooseOption } from './_choice';

// No global setupFiles in this project: without this cleanup, renders
// accumulate from one test to the next and labels become ambiguous.
afterEach(cleanup);

// FIELD SYSTEM (issue #41). The stakes are not the appearance: it is that the
// label, the help text and the error are ATTACHED to the control — once,
// for every form on the site. These tests hold that contract, including
// for the slots that #12 (accessibility) and #37 (UX) will fill.

function intl(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('Champ — libellé et rattachement ARIA', () => {
  it('associe le libellé au contrôle (sans id fourni)', () => {
    render(<TextField label="Adresse e-mail" name="email" />);
    const input = screen.getByLabelText('Adresse e-mail');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('name')).toBe('email');
  });

  it('respecte un id imposé par l’appelant', () => {
    render(<TextField label="Pays" id="y-country" name="country" />);
    expect(screen.getByLabelText('Pays').getAttribute('id')).toBe('y-country');
  });

  it('un libellé masqué reste un libellé (pas un placeholder)', () => {
    render(<TextField label="Nom complet" labelHidden placeholder="Nom" />);
    const input = screen.getByLabelText('Nom complet');
    expect(input.getAttribute('placeholder')).toBe('Nom');
    // Hidden to the eye, present for assistive technologies.
    expect(screen.getByText('Nom complet').className).toContain('sr-only');
  });

  it('décrit le contrôle par son texte d’aide', () => {
    render(<TextField label="Année" hint="Entre 1990 et aujourd’hui." />);
    const input = screen.getByLabelText('Année');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Entre 1990 et aujourd’hui.',
    );
  });

  it('sans erreur : ni aria-invalid ni description d’erreur', () => {
    render(<TextField label="Pays" />);
    const input = screen.getByLabelText('Pays');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('avec erreur : le contrôle est marqué invalide ET décrit par le message', () => {
    render(<TextField label="Pays" error="Renseignez un pays." />);
    const input = screen.getByLabelText('Pays');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Renseignez un pays.',
    );
  });

  it('aide ET erreur : les deux décrivent le contrôle', () => {
    render(
      <TextField
        label="Année"
        hint="Format AAAA."
        error="Année hors bornes."
      />,
    );
    const ids = screen
      .getByLabelText('Année')
      .getAttribute('aria-describedby')!
      .split(' ');
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Format AAAA.',
      'Année hors bornes.',
    ]);
  });
});

describe('Champ — valeur contrôlée', () => {
  it('transmet valeur et changements au contrôle', () => {
    const seen: string[] = [];
    render(
      <TextField
        label="Titre"
        value="Démocratie"
        onChange={(e) => seen.push(e.target.value)}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Titre');
    expect(input.value).toBe('Démocratie');
    fireEvent.change(input, { target: { value: 'Démocratie & médias' } });
    expect(seen).toEqual(['Démocratie & médias']);
  });

  it('zone de texte : libellé associé et valeur contrôlée', () => {
    render(
      <TextareaField label="Message" value="Bonjour" onChange={() => {}} />,
    );
    const area = screen.getByLabelText<HTMLTextAreaElement>('Message');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('Bonjour');
  });

  it('liste déroulante : libellé associé et option sélectionnable', () => {
    const seen: string[] = [];
    render(
      <SelectField
        label="Axe de travail"
        value="gouvernance"
        onValueChange={(v) => seen.push(v)}
        options={[
          { value: 'gouvernance', label: 'Gouvernance' },
          { value: 'elections', label: 'Élections' },
        ]}
      />,
    );
    // The shadcn select: a button named by the field's label, showing the
    // current choice.
    const select = screen.getByLabelText('Axe de travail');
    expect(select.getAttribute('role')).toBe('combobox');
    expect(select.textContent).toContain('Gouvernance');
    chooseOption(select, 'Élections');
    expect(seen).toEqual(['elections']);
  });

  it('liste déroulante : le choix vide est soumis comme une chaîne vide', () => {
    // A GET form (the search page) reads the value from the URL: the
    // "any" choice must reach it as `type=`, as a native select sent it —
    // not as the sentinel Radix needs internally.
    const { container } = render(
      <form>
        <SelectField
          label="Type"
          name="type"
          defaultValue=""
          emptyLabel="Indifférent"
          options={[{ value: 'rapport', label: 'Rapport' }]}
        />
      </form>,
    );
    const form = container.querySelector('form')!;
    expect(new FormData(form).get('type')).toBe('');
    chooseOption(screen.getByLabelText('Type'), 'Rapport');
    expect(new FormData(form).get('type')).toBe('rapport');
    chooseOption(screen.getByLabelText('Type'), 'Indifférent');
    expect(new FormData(form).get('type')).toBe('');
  });
});

describe('Champ — contrôles particuliers', () => {
  it('la coquille remet le rattachement à un contrôle quelconque', () => {
    render(
      <Field label="Document (PDF)" hint="20 Mo maximum.">
        {(control) => <input type="file" {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Document (PDF)');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('mot de passe : libellé associé, bascule afficher/masquer intacte', () => {
    render(intl(<PasswordField label="Mot de passe" name="password" />));
    const input = screen.getByLabelText<HTMLInputElement>('Mot de passe');
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /afficher/i }));
    expect(input.type).toBe('text');
  });

  // FAKE timers for this test only (audit F-01, second defect).
  //
  // `input-otp` schedules a `setTimeout` that it does not cancel on unmount.
  // `cleanup()` does unmount the component, but the timer outlives the FILE:
  // it fires later, calls `setState`, and finds a happy-dom environment
  // already torn down — "ReferenceError: window is not defined", reported
  // by Vitest as an uncaught exception, and the whole run fails
  // even though all 771 tests are green.
  //
  // Measured before the fix, in shuffled order: seed 11 failed 3 times out of 3,
  // seed 6 once out of 3. Nothing to do with what this test checks — it is
  // exactly the kind of red that teaches reviewers to ignore red,
  // and it would have made the shuffled-order CI job added elsewhere useless.
  //
  // Fake timers make the leak harmless: whatever is scheduled
  // during the test is thrown away with them, without changing the assertions —
  // those are synchronous.
  it('code à usage unique : le libellé désigne bien la saisie', () => {
    vi.useFakeTimers();
    try {
      render(intl(<OtpField value="" onChange={() => {}} />));
      const input = screen.getByLabelText('Code de vérification');
      expect(input.tagName).toBe('INPUT');
    } finally {
      cleanup();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe('Erreur de formulaire', () => {
  it('ne rend rien sans message', () => {
    const { container } = render(<FormError />);
    expect(container.innerHTML).toBe('');
  });

  it('annonce le message sans déplacer le focus', () => {
    render(<FormError>Envoi impossible.</FormError>);
    expect(screen.getByRole('alert').textContent).toBe('Envoi impossible.');
  });
});
