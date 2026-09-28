// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';

// AN OPEN DIALOG MUST NOT DISAPPEAR UNDER THE CURSOR.
//
// Convex's `useQuery` returns `undefined` until a response has arrived,
// then the value. That `undefined` comes back on every socket reconnection and
// every token rotation, on an ALREADY resolved query. The users
// screen treated it as "no data" and rendered "Chargement…"
// in place of its subtree: the table, the invitation form, and the
// confirmation open in a row were unmounted all at once.
//
// This is not a flicker. It is an administrator confirming a
// role change, seeing the box vanish, and not knowing whether the action
// took effect. CI saw it through its symptom: "element was detached from the DOM"
// during the click on "Changer le rôle".
//
// This file holds the property end to end, on the real screen: the query
// blinks, the dialog stays. And the distinction it rests on — `undefined`
// (not yet known) versus `null` (nobody) — is held just below,
// because confusing the two is precisely what produced the defect.

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

// Opens the confirmation via the real path: choose, then "Appliquer".
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

    // THE BLINK. The query goes back to "not yet known", as after a
    // socket reconnection, and the screen redraws.
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
    // And the button stays clickable: it is IT that CI saw become detached.
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
    // THE SECOND UNMOUNT PATH, the one CI revealed afterwards. The
    // search is debounced: typing then clicking "Appliquer" right
    // after lets the request go out while the box is open. The
    // arguments change, `usePaginatedQuery` goes back to `LoadingFirstPage` and
    // returns an EMPTY list — the row disappears, and the confirmation with it.
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
    // The frozen row stays on screen: it is what carries the box.
    expect(screen.getByText(CIBLE)).toBeTruthy();
  });

  it('sans confirmation ouverte, un rechargement montre « Chargement… »', () => {
    // The freeze is LIMITED to the action. Outside of it, the screen says what it is doing, as
    // before: without this limit, a stale list would stay displayed
    // indefinitely after a search change.
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
    // The fix must not remove the INITIAL loading state: there is
    // then no known value to retain, and the screen must say so.
    convex.queries.set('users:current', undefined);
    afficher();
    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.queryByText(CIBLE)).toBeNull();
  });

  it('une déconnexion, elle, sort de l’écran — `null` n’est pas `undefined`', () => {
    const { rerender } = afficher();
    expect(screen.getByText(CIBLE)).toBeTruthy();

    // `null` is an ANSWER: the query says "nobody". Retaining the last
    // known value here would keep an admin screen open after
    // a sign-out.
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
