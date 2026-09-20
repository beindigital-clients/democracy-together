// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AuthorList } from '@/components/library/author-list';

afterEach(cleanup);

// LISTE D'AUTEURS de la fiche publication (issue #34).
//
// La fiche l'assemblait à la main : virgules entre les noms, puis « and » ou
// « et » choisi par un ternaire sur la locale. Ce que ce test vérifie n'est
// donc pas le gras — c'est que la PONCTUATION vient de la langue, et que le
// découpage noms / séparateurs tient : l'anglais met une virgule avant
// « and » (virgule de Oxford), le français n'en met pas avant « et ». Aucune
// des deux règles n'est écrite dans le dépôt ; `Intl.ListFormat` les tient.

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
