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

// CHAMP DE RECHERCHE DES LISTES DU BACK-OFFICE (issue #49).
//
// CE QUE CE FICHIER PEUT ET NE PEUT PAS VÉRIFIER, et c'est la conséquence
// directe de la contrainte de l'issue. La recherche est faite par le SERVEUR :
// le composant ne filtre rien, il produit le terme qui devient un argument de
// la query paginée. Un test qui prendrait la liste rendue et la verrait
// raccourcir après une frappe ne prouverait donc rien de ce qui compte — il
// passerait tout aussi bien si le filtrage était fait en mémoire sur la page
// déjà chargée, c'est-à-dire précisément ce que l'issue interdit.
//
// Le harnais ci-dessous tient les deux bouts : un composant hôte joue le rôle
// d'un écran de liste — il garde le terme dans son état, le passe à un SERVEUR
// SIMULÉ, et rend ce que ce serveur renvoie. Les lignes affichées ne sont
// jamais filtrées côté client. On vérifie alors ce qui est vérifiable ici :
//
//  — la liste affichée se restreint, et elle se restreint à ce que le serveur a
//    renvoyé POUR LE TERME REÇU ;
//  — le terme atteint une ligne ABSENTE de la première page : un filtrage de ce
//    qui est affiché en serait incapable ;
//  — la fréquence (une seule interrogation pour une saisie continue) et le
//    plancher (en dessous du minimum serveur, aucune recherche).
//
// Que la recherche restreigne réellement en base est vérifié là où c'est
// vérifiable : convex/admin-search.test.ts, et le parcours E2E.

// « Base » du serveur simulé. La page par défaut n'en montre que les deux
// premières lignes — comme une vraie première page paginée.
const ROWS = [
  'awa.diop@institut-sahel.org',
  'moussa.ba@institut-sahel.org',
  'lea.martin@reseau.eu',
  'jan.novak@reseau.eu',
];
const PAGE_SIZE = 2;

function fakeServer(term: string): string[] {
  // Ce que fait une query paginée : elle cherche dans TOUTE la table, puis
  // rend une page. Pas l'inverse.
  const matching = term
    ? ROWS.filter((row) => row.includes(term.trim().toLowerCase()))
    : ROWS;
  return matching.slice(0, PAGE_SIZE);
}

function ListScreen({ onQuery }: { onQuery: (term: string) => void }) {
  const [term, setTerm] = useState('');
  onQuery(term);
  // Le rendu ne filtre RIEN : il affiche la page telle que le serveur la rend.
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
  // Ce que la query a reçu de DISTINCT, dans l'ordre : c'est cela qui compte,
  // pas le nombre de rendus.
  const asked = () =>
    queries.filter((term, i) => i === 0 || term !== queries[i - 1]);
  return { field, asked };
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

// La temporisation du champ est un vrai délai : on le fait passer explicitement
// plutôt que d'attendre, pour que le test reste déterministe.
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
    // `getByRole('searchbox', { name })` n'aboutit que si le champ porte un nom
    // accessible : ici le `<label>` masqué du système de champs (#41).
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
    // La preuve que la restriction n'est pas un filtrage de l'affichage :
    // « jan » n'apparaissait nulle part avant la recherche.
    const { field } = setup();
    expect(shown().join(' ')).not.toContain('jan.novak');

    type(field, 'jan');
    settle();

    expect(shown()).toEqual(['jan.novak@reseau.eu']);
  });

  it('remonte le terme UNE fois pour une saisie continue', () => {
    const { field, asked } = setup();
    // Quatre frappes successives, sans pause : une seule interrogation.
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

    // Le champ garde la saisie (rien n'est réécrit sous les doigts)…
    expect((field as HTMLInputElement).value).toBe(
      'a'.repeat(SEARCH_MIN_LENGTH - 1),
    );
    // … mais aucun terme n'a été demandé, et la liste n'a pas bougé.
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
    // Même valeur re-saisie (collage, correction annulée) : pas de seconde
    // interrogation, donc pas d'abonnement rouvert pour rien.
    type(field, 'jan');
    settle();
    expect(asked()).toEqual(['', 'jan']);
  });
});
