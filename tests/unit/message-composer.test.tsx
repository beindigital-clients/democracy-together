// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import { MessageComposer } from '@/components/social/message-composer';

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof MessageComposer>[0]> = {}) {
  const onSend = props.onSend ?? vi.fn(async () => undefined);
  render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <MessageComposer label="Votre message" {...props} onSend={onSend} />
    </NextIntlClientProvider>,
  );
  return { onSend, field: screen.getByLabelText('Votre message') };
}

describe('MessageComposer', () => {
  it('Entrée envoie et vide le champ ; Maj+Entrée n’envoie pas', async () => {
    const { onSend, field } = mount();
    fireEvent.change(field, { target: { value: 'Bonjour' } });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    expect(onSend).toHaveBeenCalledWith('Bonjour');
    expect((field as HTMLTextAreaElement).value).toBe('');
  });

  it('un message vide ne part pas, le bouton est inactif', () => {
    const { onSend, field } = mount();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Envoyer' }).disabled).toBe(true);
  });

  it('échec : le texte revient et l’erreur s’affiche', async () => {
    const { field } = mount({
      onSend: async () => {
        throw new Error('Trop de messages en peu de temps.');
      },
    });
    fireEvent.change(field, { target: { value: 'Relance' } });
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    expect((field as HTMLTextAreaElement).value).toBe('Relance');
    expect(screen.getByRole('alert').textContent).toContain('Trop de messages');
  });

  it('saisie en cours signalée, puis retirée quand le champ se vide', () => {
    const onTyping = vi.fn();
    const { field } = mount({ onTyping });
    fireEvent.change(field, { target: { value: 'B' } });
    fireEvent.change(field, { target: { value: 'Bo' } });
    expect(onTyping).toHaveBeenCalledTimes(1);
    expect(onTyping).toHaveBeenLastCalledWith(true);
    fireEvent.change(field, { target: { value: '' } });
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });

  it('réponse : bandeau annulable, Échap l’annule', () => {
    const onCancelContext = vi.fn();
    const { field } = mount({
      context: { kind: 'reply', label: 'Réponse à Awa', excerpt: 'Jeudi ?' },
      onCancelContext,
    });
    expect(screen.getByText('Réponse à Awa')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancelContext).toHaveBeenCalled();
  });
});
