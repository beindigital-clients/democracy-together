// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AuthorList } from '@/components/library/author-list';

afterEach(cleanup);

// AUTHOR LIST on the publication page (issue #34).
//
// The page assembled it by hand: commas between names, then "and" or
// "et" chosen by a ternary on the locale. What this test checks is
// therefore not the bold — it is that the PUNCTUATION comes from the language, and that the
// names / separators split holds: English puts a comma before
// "and" (Oxford comma), French puts none before "et". Neither
// rule is written in the repo; `Intl.ListFormat` handles them.

const THREE = ['Awa Diop', 'Marc Lefèvre', 'Chen Wei'];

function boldNames(): string[] {
  return [...document.querySelectorAll('b')].map((b) => b.textContent ?? '');
}

describe('Liste d’auteurs — la ponctuation suit la langue', () => {
  it('français : « A, B et C »', () => {
    render(
      <p data-testid="authors">
        <AuthorList names={THREE} locale="fr" />
      </p>,
    );
    expect(screen.getByTestId('authors').textContent).toBe(
      'Awa Diop, Marc Lefèvre et Chen Wei',
    );
  });

  it('anglais : « A, B, and C » — la virgule que la règle en dur perdait', () => {
    render(
      <p data-testid="authors">
        <AuthorList names={THREE} locale="en" />
      </p>,
    );
    expect(screen.getByTestId('authors').textContent).toBe(
      'Awa Diop, Marc Lefèvre, and Chen Wei',
    );
  });

  it('seuls les NOMS sont en gras — jamais un séparateur', () => {
    for (const locale of ['fr', 'en']) {
      render(
        <p>
          <AuthorList names={THREE} locale={locale} />
        </p>,
      );
      expect(boldNames()).toEqual(THREE);
      cleanup();
    }
  });

  it('un seul auteur : le nom, rien autour', () => {
    render(
      <p data-testid="authors">
        <AuthorList names={['Awa Diop']} locale="en" />
      </p>,
    );
    expect(screen.getByTestId('authors').textContent).toBe('Awa Diop');
    expect(boldNames()).toEqual(['Awa Diop']);
  });

  it('aucun auteur : rien du tout, et surtout pas un séparateur orphelin', () => {
    render(
      <p data-testid="authors">
        <AuthorList names={[]} locale="fr" />
      </p>,
    );
    expect(screen.getByTestId('authors').textContent).toBe('');
  });
});
