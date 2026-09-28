// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import { routing } from '@/i18n/routing';

// Issue #35 — a Tribune post is written in ONE language and is never
// translated: it is this language, declared here, that will set the page's
// canonical. It is PRE-FILLED with the interface language, not inferred
// from it: a member browsing in French can write in English, and only they
// know it.

// No global setupFiles in this project (see directory-fields.test.tsx).
afterEach(cleanup);

const createPost = vi.fn();
// A single response for all the composer's queries: the user
// (`users.current`) AND the moderation rule (`tribune.moderationPolicy`),
// of which only `postMode` is read. The mode is configurable per test.
const policy = { postMode: 'a_priori' as 'a_priori' | 'a_posteriori' };
vi.mock('convex/react', () => ({
  useQuery: () => ({
    _id: 'u1',
    role: 'membre',
    name: 'Awa Diop',
    postMode: policy.postMode,
  }),
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
    fireEvent.click(
      screen.getByRole('button', { name: fr.tribune.submitForReview }),
    );

    await vi.waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    expect(createPost.mock.calls[0][0]).toMatchObject({ lang: 'en' });
  });

  it('propose exactement les langues servies par le site', () => {
    // Derived from `routing.locales` rather than copied: that is what the test's
    // title claims, and a sixth language must not make this
    // file fail — it must appear in the selector.
    const select = openComposer('fr');
    expect([...select.options].map((o) => o.value)).toEqual([
      ...routing.locales,
    ]);
  });
});

// 27/09 campaign — three composer anomalies, fixed together:
//   A-05  no visible counter or limit; 12,000 characters accepted as a
//         "Brève", 21,000 refused under a generic message (F-46);
//   A-09  "Annuler" redisplayed the previous draft and format;
//   A-11  nothing told authors that their post is published immediately.
// The numbers come from `TRIBUNE_BODY` — the same constant as the server —
// and the expected text is rendered by the catalog, not copied by hand.
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
    // "Analyse": the limit goes up to 20,000.
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldFormat), {
      target: { value: 'fond' },
    });
    expect(compteur()).toBe(
      message('bodyCount', { count: 11, max: TRIBUNE_BODY.fond.max }),
    );
    // The field's `maxLength` is that of the current format.
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
    // 10,001 characters fit in an Analyse — not in a Brève. A
    // `maxLength` alone does not truncate what has already been entered: that is the case
    // measured (12,000 characters published as a "Brève" without a word).
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: 'a'.repeat(TRIBUNE_BODY.court.max + 1) },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldFormat), {
      target: { value: 'court' },
    });
    expect(compteur()).toBe(
      message('bodyLimitReached', { max: TRIBUNE_BODY.court.max }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: fr.tribune.submitForReview }),
    );
    // Comparison on `textContent`: the French thousands separator is
    // a narrow no-break space, which `findByText`'s normalizer collapses.
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
    // "Continuer à écrire": nothing is lost.
    fireEvent.click(
      screen.getByRole('button', { name: fr.tribune.cancelConfirmNo }),
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(fr.tribune.fieldBody).value,
    ).toBe(texte);

    // "Abandonner": the composer closes, and reopens blank.
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

// A-11 then F-45: authors must know what happens to their post. Under
// PRE-moderation (the default), it awaits approval — the screen says so
// BEFORE sending ("Soumettre à la modération" button) and AFTER; under
// post-moderation, it is published immediately.
describe('Composer de la Tribune — sort du billet annoncé (A-11, F-45)', () => {
  function fill() {
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldTitle), {
      target: { value: 'Sur les transitions' },
    });
    fireEvent.change(screen.getByLabelText(fr.tribune.fieldBody), {
      target: { value: 'Une contribution courte mais valable.' },
    });
  }

  it('a priori : le billet est soumis à la modération, et l’écran le dit', async () => {
    policy.postMode = 'a_priori';
    createPost.mockReset();
    createPost.mockResolvedValue('post1');
    openComposer('fr');
    expect(screen.getByText(fr.tribune.policyAPriori)).toBeTruthy();
    fill();
    fireEvent.click(
      screen.getByRole('button', { name: fr.tribune.submitForReview }),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      fr.tribune.submittedPending,
    );
  });

  it('a posteriori : le billet est publié aussitôt, et l’écran le dit', async () => {
    policy.postMode = 'a_posteriori';
    createPost.mockReset();
    createPost.mockResolvedValue('post1');
    openComposer('fr');
    fill();
    fireEvent.click(screen.getByRole('button', { name: fr.tribune.publish }));
    expect((await screen.findByRole('status')).textContent).toContain(
      fr.tribune.published,
    );
    policy.postMode = 'a_priori';
  });
});
