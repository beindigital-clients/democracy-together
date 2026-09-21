// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  Field,
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { PasswordField } from '@/components/auth/password-field';
import { OtpField } from '@/components/auth/otp-field';

// Pas de setupFiles global dans ce projet : sans ce cleanup, les rendus
// s'accumulent d'un test à l'autre et les libellés deviennent ambigus.
afterEach(cleanup);

// SYSTÈME DE CHAMPS (issue #41). L'enjeu n'est pas l'apparence : c'est que le
// libellé, l'aide et l'erreur soient RATTACHÉS au contrôle — une seule fois,
// pour tous les formulaires du site. Ces tests tiennent ce contrat, y compris
// pour les emplacements que #12 (accessibilité) et #37 (UX) rempliront.

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
    // Masqué à l'œil, présent pour les technologies d'assistance.
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
        onChange={(e) => seen.push(e.target.value)}
      >
        <option value="gouvernance">Gouvernance</option>
        <option value="elections">Élections</option>
      </SelectField>,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Axe de travail');
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('gouvernance');
    fireEvent.change(select, { target: { value: 'elections' } });
    expect(seen).toEqual(['elections']);
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

  // Minuteries FEINTES pour ce test seulement (audit F-01, second défaut).
  //
  // `input-otp` programme un `setTimeout` qu'il n'annule pas au démontage.
  // `cleanup()` démonte bien le composant, mais la minuterie survit au FICHIER :
  // elle se déclenche plus tard, appelle `setState`, et trouve un environnement
  // happy-dom déjà détruit — « ReferenceError: window is not defined », signalée
  // par Vitest comme exception non capturée, et le run entier passe en échec
  // alors que les 771 tests sont verts.
  //
  // Mesuré avant correctif, en ordre mélangé : seed 11 échouait 3 fois sur 3,
  // seed 6 une fois sur 3. Rien à voir avec ce que ce test vérifie — c'est
  // exactement le genre de rouge qui apprend aux relecteurs à ignorer le rouge,
  // et il aurait rendu inutile le job CI en ordre mélangé ajouté par ailleurs.
  //
  // Les minuteries feintes rendent la fuite inoffensive : ce qui est programmé
  // pendant le test est jeté avec elles, sans rien changer aux assertions —
  // celles-ci sont synchrones.
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
