// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';

// UN DIALOGUE OUVERT NE DOIT PAS DISPARAÎTRE SOUS LE CURSEUR.
//
// `useQuery` de Convex rend `undefined` tant qu'une réponse n'est pas arrivée,
// puis la valeur. Ce `undefined` revient à chaque reconnexion du socket et à
// chaque rotation du jeton, sur une query DÉJÀ résolue. L'écran des
// utilisateurs le traitait comme « pas de données » et rendait « Chargement… »
// à la place de son sous-arbre : le tableau, le formulaire d'invitation, et la
// confirmation ouverte dans une ligne étaient démontés d'un coup.
//
// Ce n'est pas un scintillement. C'est un administrateur qui confirme un
// changement de rôle, voit la boîte s'évanouir, et ne sait pas si le geste a
// porté. La CI l'a vu par son symptôme : « element was detached from the DOM »
// pendant le clic sur « Changer le rôle ».
//
// Ce fichier tient la propriété de bout en bout, sur l'écran réel : la query
// cligne, le dialogue reste. Et la distinction qui la fonde — `undefined`
// (pas encore connu) contre `null` (personne) — est tenue juste en dessous,
// parce que confondre les deux est précisément ce qui a produit le défaut.

afterEach(cleanup);

const convex = vi.hoisted(() => ({
  queries: new Map<string, unknown>(),
  page: { results: [] as unknown[], status: 'Exhausted' as const },
  mutation: () => Promise.resolve(),
}));

vi.mock('convex/react', async () => {
  const { getFunctionName } = await import('convex/server');
  return {
    useQuery: (ref: unknown, args: unknown) =>
      args === 'skip'
        ? undefined
        : convex.queries.get(getFunctionName(ref as never)),
    useMutation: () => convex.mutation,
    useAction: () => convex.mutation,
    usePaginatedQuery: () => ({ ...convex.page, loadMore: () => {} }),
  };
});

const { default: AdminUsers } =
  await import('@/app/[locale]/admin/utilisateurs/page');

const CIBLE = 'cible@democracytogether.test';

function afficher() {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <AdminUsers />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  convex.queries.clear();
  convex.queries.set('users:current', { _id: 'u1', role: 'admin' });
  convex.page = {
    results: [{ _id: 'u2', email: CIBLE, name: null, role: 'membre' }],
    status: 'Exhausted',
  };
});

// Ouvre la confirmation par le chemin réel : choisir, puis « Appliquer ».
function ouvrirLaConfirmation() {
  fireEvent.change(screen.getByLabelText(`Rôle ${CIBLE}`), {
    target: { value: 'moderateur' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }));
  return screen.getByRole('dialog', {
    name: `Changer le rôle de ${CIBLE} ?`,
  });
}

describe('Écran des utilisateurs — un clignotement ne démonte rien', () => {
  it('la confirmation ouverte survit à un `undefined` de `users.current`', () => {
    const { rerender } = afficher();
    expect(ouvrirLaConfirmation()).toBeTruthy();

    // LE CLIGNOTEMENT. La query repasse à « pas encore connu », comme après une
    // reconnexion du socket, et l'écran se redessine.
    convex.queries.set('users:current', undefined);
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <AdminUsers />
      </NextIntlClientProvider>,
    );

    expect(
      screen.queryByRole('dialog', {
        name: `Changer le rôle de ${CIBLE} ?`,
      }),
      'le dialogue a été démonté par un clignotement de la query',
    ).toBeTruthy();
    // Et le bouton reste cliquable : c'est LUI que la CI a vu se détacher.
    expect(
      screen.getByRole('button', { name: 'Changer le rôle' }),
    ).toBeTruthy();
  });

  it('le tableau reste à l’écran, au lieu de céder la place à « Chargement… »', () => {
    const { rerender } = afficher();
    expect(screen.getByText(CIBLE)).toBeTruthy();

    convex.queries.set('users:current', undefined);
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <AdminUsers />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(CIBLE)).toBeTruthy();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('la confirmation survit au rechargement d’une première page', () => {
    // LE SECOND CHEMIN DE DÉMONTAGE, celui que la CI a montré après coup. La
    // recherche est temporisée : frapper puis cliquer « Appliquer » dans la
    // foulée laisse partir la requête pendant que la boîte est ouverte. Les
    // arguments changent, `usePaginatedQuery` repasse à `LoadingFirstPage` et
    // rend une liste VIDE — la ligne disparaît, la confirmation avec.
    const { rerender } = afficher();
    expect(ouvrirLaConfirmation()).toBeTruthy();

    convex.page = { results: [], status: 'LoadingFirstPage' as never };
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <AdminUsers />
      </NextIntlClientProvider>,
    );

    expect(
      screen.queryByRole('dialog', {
        name: `Changer le rôle de ${CIBLE} ?`,
      }),
      'le dialogue a été démonté par un rechargement de la liste',
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Changer le rôle' }),
    ).toBeTruthy();
    // La ligne gelée reste à l'écran : c'est elle qui porte la boîte.
    expect(screen.getByText(CIBLE)).toBeTruthy();
  });

  it('sans confirmation ouverte, un rechargement montre « Chargement… »', () => {
    // Le gel est BORNÉ au geste. Hors de lui, l'écran dit ce qu'il fait, comme
    // avant : sans cette limite, une liste périmée resterait affichée
    // indéfiniment après un changement de recherche.
    const { rerender } = afficher();
    expect(screen.getByText(CIBLE)).toBeTruthy();

    convex.page = { results: [], status: 'LoadingFirstPage' as never };
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <AdminUsers />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.queryByText(CIBLE)).toBeNull();
  });

  it('le premier rendu, lui, montre bien « Chargement… »', () => {
    // La correction ne doit pas supprimer l'état de chargement INITIAL : il n'y
    // a alors aucune valeur connue à retenir, et l'écran doit le dire.
    convex.queries.set('users:current', undefined);
    afficher();
    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.queryByText(CIBLE)).toBeNull();
  });

  it('une déconnexion, elle, sort de l’écran — `null` n’est pas `undefined`', () => {
    const { rerender } = afficher();
    expect(screen.getByText(CIBLE)).toBeTruthy();

    // `null` est une RÉPONSE : la query dit « personne ». Retenir la dernière
    // valeur connue ici maintiendrait un écran d'administration ouvert après
    // une déconnexion.
    convex.queries.set('users:current', null);
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <AdminUsers />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Réservé aux administrateurs.')).toBeTruthy();
    expect(screen.queryByText(CIBLE)).toBeNull();
  });
});
