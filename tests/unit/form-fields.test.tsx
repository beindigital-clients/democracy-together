// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState, type FormEvent } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  FormError,
  TextField,
  TextareaField,
  useFormFields,
} from '@/components/ui/field';

// Pas de setupFiles global dans ce projet : sans ce cleanup, les rendus
// s'accumulent d'un test à l'autre et les libellés deviennent ambigus.
afterEach(cleanup);

// VALIDATION PAR CHAMP ET CONSERVATION DES SAISIES (issue #37).
//
// Ce que ces tests tiennent, c'est ce que l'issue demande : chaque champ fautif
// porte SON message (et non un message unique en bas de formulaire pour trois
// causes), et un refus serveur ne vide aucun champ.

// Formulaire témoin : les mêmes pièces que les formulaires du site (coquille de
// champ, règles par champ, erreur de formulaire), sans Convex ni i18n.
function TestForm({
  onSend = async () => {},
}: {
  onSend?: (values: {
    name: string;
    email: string;
    message: string;
  }) => Promise<void>;
}) {
  const { values, field, validate, reset } = useFormFields({
    name: '',
    email: '',
    message: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    if (
      !validate({
        name: (v) => (v.trim().length < 2 ? 'Indiquez votre nom.' : null),
        email: (v) => (v.includes('@') ? null : 'Adresse e-mail invalide.'),
        message: (v) => (v.trim().length < 10 ? 'Message trop court.' : null),
      })
    ) {
      return;
    }
    try {
      await onSend(values);
    } catch {
      setFormError('Envoi impossible.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField label="Nom" {...field('name')} />
      <TextField label="E-mail" {...field('email')} />
      <TextareaField label="Message" {...field('message')} />
      <FormError>{formError}</FormError>
      <button type="submit">Envoyer</button>
      <button type="button" onClick={() => reset()}>
        Réinitialiser
      </button>
    </form>
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
}

describe('Validation par champ', () => {
  it('donne à CHAQUE champ fautif son propre message', () => {
    render(<TestForm />);
    fill('Nom', 'A');
    fill('E-mail', 'pas-un-email');
    fill('Message', 'court');
    send();

    const name = screen.getByLabelText('Nom');
    const email = screen.getByLabelText('E-mail');
    const message = screen.getByLabelText('Message');

    for (const [control, text] of [
      [name, 'Indiquez votre nom.'],
      [email, 'Adresse e-mail invalide.'],
      [message, 'Message trop court.'],
    ] as const) {
      expect(control.getAttribute('aria-invalid')).toBe('true');
      const describedBy = control.getAttribute('aria-describedby');
      expect(document.getElementById(describedBy!)?.textContent).toBe(text);
    }
  });

  it('ne marque QUE les champs fautifs', () => {
    render(<TestForm />);
    fill('Nom', 'Awa Diop');
    fill('E-mail', 'pas-un-email');
    fill('Message', 'Un message bien assez long pour passer.');
    send();

    expect(
      screen.getByLabelText('Nom').getAttribute('aria-invalid'),
    ).toBeNull();
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(
      screen.getByLabelText('Message').getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('porte le focus sur le PREMIER champ fautif', () => {
    render(<TestForm />);
    fill('Nom', 'Awa Diop');
    fill('E-mail', 'pas-un-email');
    fill('Message', 'court');
    send();

    // Au clavier comme au lecteur d'écran, c'est ce qui fait entendre le
    // message : il décrit le contrôle qui vient de prendre le focus.
    expect(document.activeElement).toBe(screen.getByLabelText('E-mail'));
  });

  it('efface le message du champ dès qu’il est corrigé', () => {
    render(<TestForm />);
    send();
    const email = screen.getByLabelText('E-mail');
    expect(email.getAttribute('aria-invalid')).toBe('true');

    fill('E-mail', 'awa@example.org');
    expect(email.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByText('Adresse e-mail invalide.')).toBeNull();
    // Les autres champs gardent le leur : corriger l'un n'absout pas les autres.
    expect(screen.getByText('Indiquez votre nom.')).toBeTruthy();
  });

  it('n’envoie pas quand une règle casse', async () => {
    const onSend = vi.fn(async () => {});
    render(<TestForm onSend={onSend} />);
    fill('Nom', 'Awa Diop');
    fill('E-mail', 'pas-un-email');
    fill('Message', 'Un message bien assez long pour passer.');
    send();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Conservation des saisies', () => {
  const valid = {
    name: 'Awa Diop',
    email: 'awa@example.org',
    message: 'Un message bien assez long pour être accepté.',
  };

  it('garde toutes les valeurs après un REFUS SERVEUR', async () => {
    const onSend = vi.fn(async () => {
      throw new Error('rate-limited');
    });
    render(<TestForm onSend={onSend} />);
    fill('Nom', valid.name);
    fill('E-mail', valid.email);
    fill('Message', valid.message);
    send();
    await screen.findByRole('alert');

    // Le refus affiche un message de formulaire — et ne coûte pas une ligne de
    // ce qui a été écrit.
    expect(screen.getByRole('alert').textContent).toBe('Envoi impossible.');
    expect(screen.getByLabelText('Nom').value).toBe(valid.name);
    expect(screen.getByLabelText('E-mail').value).toBe(valid.email);
    expect(screen.getByLabelText('Message').value).toBe(valid.message);
  });

  it('garde les valeurs après un refus de VALIDATION', () => {
    render(<TestForm />);
    fill('Nom', 'A');
    fill('Message', valid.message);
    send();

    expect(screen.getByLabelText('Nom').value).toBe('A');
    expect(screen.getByLabelText('Message').value).toBe(valid.message);
  });

  it('`reset` revient aux valeurs de départ et efface les messages', () => {
    render(<TestForm />);
    fill('Nom', 'A');
    send();
    expect(screen.getByText('Indiquez votre nom.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByLabelText('Nom').value).toBe('');
    expect(screen.queryByText('Indiquez votre nom.')).toBeNull();
    expect(
      screen.getByLabelText('Nom').getAttribute('aria-invalid'),
    ).toBeNull();
  });
});
