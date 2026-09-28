// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import { SEARCH_MIN_LENGTH } from '@convex/lib/search';
import { AdminSearch } from '@/components/admin/admin-search';

afterEach(cleanup);

// SEARCH FIELD FOR BACK-OFFICE LISTS (issue #49).
//
// WHAT THIS FILE CAN AND CANNOT VERIFY, and it is the direct
// consequence of the issue's constraint. The search is done by the SERVER:
// the component filters nothing, it produces the term that becomes an argument of
// the paginated query. A test that took the rendered list and saw it
// shrink after a keystroke would therefore prove nothing that matters — it
// would pass just as well if filtering were done in memory on the page
// already loaded, i.e. precisely what the issue forbids.
//
// The harness below holds both ends: a host component plays the role
// of a list screen — it keeps the term in its state, passes it to a SIMULATED
// SERVER, and renders what that server returns. The displayed rows are
// never filtered client-side. We then check what can be checked here:
//
//  — the displayed list narrows, and it narrows to what the server
//    returned FOR THE TERM IT RECEIVED;
//  — the term reaches a row ABSENT from the first page: filtering what
//    is displayed would be incapable of that;
//  — the frequency (a single query for continuous typing) and the
//    floor (below the server minimum, no search).
//
// That the search really narrows in the database is checked where it is
// checkable: convex/admin-search.test.ts, and the E2E flow.

// The simulated server's "database". The default page only shows its first
// two rows — like a real first paginated page.
const ROWS = [
  'awa.diop@institut-sahel.org',
  'moussa.ba@institut-sahel.org',
  'lea.martin@reseau.eu',
  'jan.novak@reseau.eu',
];
const PAGE_SIZE = 2;

function fakeServer(term: string): string[] {
  // What a paginated query does: it searches the WHOLE table, then
  // returns a page. Not the other way around.
  const matching = term
    ? ROWS.filter((row) => row.includes(term.trim().toLowerCase()))
    : ROWS;
  return matching.slice(0, PAGE_SIZE);
}

function ListScreen({ onQuery }: { onQuery: (term: string) => void }) {
  const [term, setTerm] = useState('');
  onQuery(term);
  // The render filters NOTHING: it displays the page as the server returns it.
  const rows = fakeServer(term);
  return (
    <div>
      <AdminSearch
        label={messages.admin.searchUsersLabel}
        placeholder={messages.admin.searchUsersPlaceholder}
        value={term}
        onChange={setTerm}
      />
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

function setup() {
  const queries: string[] = [];
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <ListScreen onQuery={(term) => queries.push(term)} />
    </NextIntlClientProvider>,
  );
  const field = screen.getByRole('searchbox', {
    name: messages.admin.searchUsersLabel,
  });
  // What the query received that was DISTINCT, in order: that is what matters,
  // not the number of renders.
  const asked = () =>
    queries.filter((term, i) => i === 0 || term !== queries[i - 1]);
  return { field, asked };
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

// The field's debounce is a real delay: we advance it explicitly
// rather than waiting, so the test stays deterministic.
function settle() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

function shown(): string[] {
  return screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
}

describe('Champ de recherche du back-office (issue #49)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('est nommé par un vrai libellé, pas par son seul placeholder', () => {
    const { field } = setup();
    // `getByRole('searchbox', { name })` only succeeds if the field has an accessible
    // name: here the field system's hidden `<label>` (#41).
    expect(field.getAttribute('placeholder')).toBe(
      messages.admin.searchUsersPlaceholder,
    );
  });

  it('saisir un terme restreint la liste affichée', () => {
    const { field } = setup();
    expect(shown()).toEqual([
      'awa.diop@institut-sahel.org',
      'moussa.ba@institut-sahel.org',
    ]);

    type(field, 'moussa');
    settle();

    expect(shown()).toEqual(['moussa.ba@institut-sahel.org']);
  });

  it('atteint une ligne qui n’était PAS dans la page affichée', () => {
    // Proof that the narrowing is not display filtering:
    // "jan" appeared nowhere before the search.
    const { field } = setup();
    expect(shown().join(' ')).not.toContain('jan.novak');

    type(field, 'jan');
    settle();

    expect(shown()).toEqual(['jan.novak@reseau.eu']);
  });

  it('remonte le terme UNE fois pour une saisie continue', () => {
    const { field, asked } = setup();
    // Four successive keystrokes, without pause: a single query.
    for (const value of ['d', 'di', 'dio', 'diop']) {
      type(field, value);
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    settle();
    expect(asked()).toEqual(['', 'diop']);
  });

  it('ne cherche pas en dessous du minimum serveur : la liste reste entière', () => {
    const { field, asked } = setup();
    const full = shown();

    type(field, 'a'.repeat(SEARCH_MIN_LENGTH - 1));
    settle();

    // The field keeps the input (nothing is rewritten under the user's fingers)…
    expect((field as HTMLInputElement).value).toBe(
      'a'.repeat(SEARCH_MIN_LENGTH - 1),
    );
    // … but no term was requested, and the list did not move.
    expect(asked()).toEqual(['']);
    expect(shown()).toEqual(full);
  });

  it('une saisie uniquement blanche ne déclenche aucune recherche', () => {
    const { field, asked } = setup();
    type(field, '    ');
    settle();
    expect(asked()).toEqual(['']);
  });

  it('effacer rend la liste complète', () => {
    const { field, asked } = setup();
    type(field, 'jan');
    settle();
    expect(shown()).toEqual(['jan.novak@reseau.eu']);

    fireEvent.click(
      screen.getByRole('button', { name: messages.admin.searchClear }),
    );
    settle();

    expect((field as HTMLInputElement).value).toBe('');
    expect(asked()).toEqual(['', 'jan', '']);
    expect(shown()).toEqual([
      'awa.diop@institut-sahel.org',
      'moussa.ba@institut-sahel.org',
    ]);
  });

  it('le bouton d’effacement n’apparaît que lorsqu’il y a quelque chose à effacer', () => {
    const { field } = setup();
    expect(
      screen.queryByRole('button', { name: messages.admin.searchClear }),
    ).toBeNull();
    type(field, 'jan');
    expect(
      screen.getByRole('button', { name: messages.admin.searchClear }),
    ).toBeTruthy();
  });

  it('un terme inchangé ne redemande rien', () => {
    const { field, asked } = setup();
    type(field, 'jan');
    settle();
    // Same value re-entered (paste, undone correction): no second
    // query, hence no subscription reopened for nothing.
    type(field, 'jan');
    settle();
    expect(asked()).toEqual(['', 'jan']);
  });
});
