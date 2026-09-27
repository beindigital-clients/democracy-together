// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import { routing } from '@/i18n/routing';

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
    // Dérivé de `routing.locales` plutôt que recopié : c'est ce que le titre
    // du test affirme, et une sixième langue ne doit pas faire échouer ce
    // fichier — elle doit apparaître dans le sélecteur.
    const select = openComposer('fr');
    expect([...select.options].map((o) => o.value)).toEqual([
      ...routing.locales,
    ]);
  });
});

// Campagne du 27/09 — trois anomalies du composer, corrigées ensemble :
//   A-05  aucun compteur ni limite visible ; 12 000 caractères acceptés en
//         « Brève », 21 000 refusés sous un message générique (F-46) ;
//   A-09  « Annuler » ré-affichait le brouillon et le format précédents ;
//   A-11  rien ne disait à l'auteur que son billet est publié immédiatement.
// Les nombres viennent de `TRIBUNE_BODY` — la même constante que le serveur —
// et le texte attendu est rendu par le catalogue, pas recopié à la main.
import { TRIBUNE_BODY } from '@convex/lib/validation';

const nombreFr = (n: number) => new Intl.NumberFormat('fr').format(n);
const message = (key: string, params: Record<string, number>) =>
  Object.entries(params).reduce(
    (s, [k, v]) => s.replace(`{${k}, number}`, nombreFr(v)),
    fr.tribune[key as keyof typeof fr.tribune],
  );

function compteur() {
  return screen.getByTestId('tr-body-count').textContent;
}

describe('Composer de la Tribune — format calibré (F-46, A-05)', () => {
  it('affiche « n / max » sous le corps, et la borne suit le format', () => {
    openComposer('fr');
    expect(compteur()).toBe(
      message('bodyCount', { count: 0, max: TRIBUNE_BODY.court.max }),
    );
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: 'Douze cars.' },
    });
    expect(compteur()).toBe(
      message('bodyCount', { count: 11, max: TRIBUNE_BODY.court.max }),
    );
    // « Analyse » : la borne passe à 20 000.
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldFormat), {
      target: { value: 'fond' },
    });
    expect(compteur()).toBe(
      message('bodyCount', { count: 11, max: TRIBUNE_BODY.fond.max }),
    );
    // Le `maxLength` du champ est celui du format courant.
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(fr.tribune.fieldBody)
        .maxLength,
    ).toBe(TRIBUNE_BODY.fond.max);
  });

  it('dit que la limite est atteinte, et refuse un texte trop long pour le format', async () => {
    createPost.mockReset();
    openComposer('fr');
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldFormat), {
      target: { value: 'fond' },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldTitle), {
      target: { value: 'Une analyse longue' },
    });
    // 10 001 caractères tiennent dans une Analyse — pas dans une Brève. Un
    // `maxLength` seul ne tronque pas ce qui est déjà saisi : c'est le cas
    // mesuré (12 000 caractères publiés en « Brève » sans un mot).
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: 'a'.repeat(TRIBUNE_BODY.court.max + 1) },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldFormat), {
      target: { value: 'court' },
    });
    expect(compteur()).toBe(
      message('bodyLimitReached', { max: TRIBUNE_BODY.court.max }),
    );
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.publish }));
    // Comparaison sur `textContent` : le séparateur de milliers français est
    // une espace fine insécable, que le normaliseur de `findByText` replie.
    expect((await screen.findByRole('alert')).textContent).toBe(
      message('errBodyTooLong', { max: TRIBUNE_BODY.court.max }),
    );
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe('Composer de la Tribune — « Annuler » et brouillon (A-09)', () => {
  it('un brouillon court est effacé sans confirmation, format et erreur compris', () => {
    openComposer('fr');
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldFormat), {
      target: { value: 'fond' },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldTitle), {
      target: { value: 'Brouillon' },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: 'Quelques mots.' },
    });
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: fr.tribune.startCta }));
    expect(
      screen.getByLabelText<HTMLInputElement>(fr.tribune.fieldTitle).value,
    ).toBe('');
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(fr.tribune.fieldBody).value,
    ).toBe('');
    expect(
      screen.getByLabelText<HTMLSelectElement>(fr.tribune.fieldFormat).value,
    ).toBe('court');
  });

  it('un brouillon de plus de 50 caractères demande confirmation avant d’être effacé', () => {
    openComposer('fr');
    const texte =
      'Un brouillon assez long pour mériter une confirmation avant effacement.';
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: texte },
    });
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.cancel }));

    const dialogue = screen.getByRole('dialog');
    expect(dialogue.textContent).toContain(fr.tribune.cancelConfirmTitle);
    // « Continuer à écrire » : rien n'est perdu.
    fireEvent.click(
      screen.getByRole('button', { name: fr.tribune.cancelConfirmNo }),
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(fr.tribune.fieldBody).value,
    ).toBe(texte);

    // « Abandonner » : le composer se referme, et rouvre vierge.
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.cancel }));
    fireEvent.click(
      screen.getByRole('button', { name: fr.tribune.cancelConfirmYes }),
    );
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.startCta }));
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(fr.tribune.fieldBody).value,
    ).toBe('');
  });
});

describe('Composer de la Tribune — publication immédiate annoncée (A-11)', () => {
  it('après publication, dit que le billet est publié et peut être signalé', async () => {
    createPost.mockReset();
    createPost.mockResolvedValue('post1');
    openComposer('fr');
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldTitle), {
      target: { value: 'Sur les transitions' },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: 'Une contribution courte mais valable.' },
    });
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.publish }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      fr.tribune.published,
    );
  });
});
