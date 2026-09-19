// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import { PasswordField } from '@/components/auth/password-field';

describe('PasswordField — afficher / masquer', () => {
  it('bascule le type du champ entre password et text', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={messages}>
        <PasswordField label="Mot de passe" name="password" />
      </NextIntlClientProvider>,
    );

    const input = screen.getByLabelText('Mot de passe');
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /afficher/i }));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /masquer/i }));
    expect(input.type).toBe('password');
  });
});
