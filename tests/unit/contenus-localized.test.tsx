// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import type { SiteLocale } from '@convex/lib/locales';
import {
  LangSwitch,
  LocalizedInput,
  MissingLangs,
  missingIn,
  previewText,
  textToList,
  type LText,
} from '@/components/admin/contenus/localized';

afterEach(cleanup);

// BACK-OFFICE TRANSLATION INPUT ("contenus" workstream, F-62): one
// language at a time, the missing-language indicator, and the same fallback as
// the server for the preview.

function Harness({ initial }: { initial: LText }) {
  const [value, setValue] = useState<LText>(initial);
  const [lang, setLang] = useState<SiteLocale>('fr');
  return (
    <NextIntlClientProvider locale="fr" messages={messages}>
      <LangSwitch
        value={lang}
        onChange={setLang}
        missing={missingIn([value])}
      />
      <LocalizedInput
        label="Titre"
        value={value}
        onChange={setValue}
        lang={lang}
        required
      />
    </NextIntlClientProvider>
  );
}

describe('Contenus — saisie traduisible', () => {
  it('signale les langues manquantes dans le nom accessible du bouton', () => {
    render(<Harness initial={{ fr: 'Bonjour' }} />);
    expect(
      screen
        .getByRole('button', { name: 'Français' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', {
        name: 'Anglais — traduction manquante',
      }),
    ).toBeTruthy();
  });

  it('saisit dans la langue choisie, sans toucher aux autres', () => {
    render(<Harness initial={{ fr: 'Bonjour' }} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Arabe — traduction manquante' }),
    );
    const input = screen.getByLabelText('Titre');
    expect(input.value).toBe('');
    expect(input.getAttribute('dir')).toBe('rtl');
    expect(input.getAttribute('lang')).toBe('ar');
    // One filled-in language is enough: the field is no longer required by the browser.
    expect(input.required).toBe(false);
    fireEvent.change(input, { target: { value: 'مرحباً' } });
    // Arabic is now translated: its indicator disappears.
    expect(screen.getByRole('button', { name: 'Arabe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByLabelText('Titre').value).toBe('Bonjour');
  });

  it('la colonne « traductions » dit ce qui manque', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={messages}>
        <MissingLangs missing={['es', 'ar']} />
        <MissingLangs missing={[]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('À traduire : Espagnol, Arabe')).toBeTruthy();
    expect(screen.getByText('Cinq langues')).toBeTruthy();
  });

  it('l’aperçu suit le repli du serveur et découpe les listes', () => {
    expect(previewText({ en: 'Hello' }, 'pt')).toEqual({
      text: 'Hello',
      fallback: true,
    });
    expect(previewText({ pt: 'Olá' }, 'pt')).toEqual({
      text: 'Olá',
      fallback: false,
    });
    expect(textToList('a\n\n b \n\n\nc', 'paragraph')).toEqual(['a', 'b', 'c']);
    expect(textToList('a\nb\n', 'line')).toEqual(['a', 'b']);
  });
});
