// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// Issue #35 — un billet de Tribune est rédigé dans UNE langue et n'est jamais
// traduit : c'est cette langue, déclarée ici, qui fixera le canonical de la
// fiche. Elle est PRÉ-REMPLIE avec la langue de l'interface, pas déduite
// d'elle : un membre qui navigue en français peut écrire en anglais, et lui
// seul le sait.

// Pas de setupFiles global dans ce projet (cf. directory-fields.test.tsx).
afterEach(cleanup);

const createPost = vi.fn();
vi.mock('convex/react', () => ({
  useQuery: () => ({ _id: 'u1', role: 'membre', name: 'Awa Diop' }),
  useMutation: () => createPost,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  useRouter: () => ({ refresh() {}, replace() {}, push() {} }),
}));

const { TribuneComposer } =
  await import('@/components/tribune/tribune-composer');

function openComposer(locale: 'fr' | 'en') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'fr' ? fr : en}
    >
      <TribuneComposer />
    </NextIntlClientProvider>,
  );
  const messages = locale === 'fr' ? fr : en;
  fireEvent.click(
    screen.getByRole('button', { name: messages.tribune.startCta }),
  );
  return screen.getByLabelText<HTMLSelectElement>(messages.tribune.fieldLang);
}

describe('Composer de la Tribune — langue du billet (#35)', () => {
  it('pré-remplit la langue du billet avec celle de l’interface', () => {
    expect(openComposer('fr').value).toBe('fr');
    cleanup();
    expect(openComposer('en').value).toBe('en');
  });

  it('n’impose pas la langue de l’interface : elle reste modifiable', async () => {
    createPost.mockReset();
    createPost.mockResolvedValue('post1');
    const select = openComposer('fr');
    fireEvent.change(select, { target: { value: 'en' } });

    fireEvent.change(screen.getByLabelText(fr.tribune.fieldTitle), {
      target: { value: 'A contribution in English' },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: {
        value: 'A short English contribution written from the French UI.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.publish }));

    await vi.waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0][0]).toMatchObject({ lang: 'en' });
  });

  it('propose exactement les langues servies par le site', () => {
    const select = openComposer('fr');
    expect([...select.options].map((o) => o.value)).toEqual(['fr', 'en']);
  });
});
