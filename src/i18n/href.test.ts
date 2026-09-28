import { describe, it, expect } from 'vitest';
import { withSearchParams } from '@/i18n/href';

// The language picker lost the query string (issue #35): this is where
// preserving filters on locale change is decided. The rest of the
// path — the /fr or /en prefix — belongs to next-intl.

describe('withSearchParams — conserver les filtres au changement de langue', () => {
  it('rejoint le chemin et la query', () => {
    expect(
      withSearchParams('/bibliotheque', 'theme=gouvernance&sort=cited&page=2'),
    ).toBe('/bibliotheque?theme=gouvernance&sort=cited&page=2');
  });

  it('accepte une query déjà préfixée de « ? »', () => {
    expect(withSearchParams('/annuaire', '?region=afrique')).toBe(
      '/annuaire?region=afrique',
    );
  });

  it('sans query, ne laisse pas un « ? » orphelin', () => {
    expect(withSearchParams('/bibliotheque', '')).toBe('/bibliotheque');
    expect(withSearchParams('/bibliotheque', '?')).toBe('/bibliotheque');
  });

  it('préserve les paramètres répétés et leur ordre', () => {
    // A round trip through `Object.fromEntries` would overwrite the first `theme`
    // and could reorder the keys: the query is therefore passed as a string.
    expect(withSearchParams('/recherche', 'theme=a&q=eau&theme=b')).toBe(
      '/recherche?theme=a&q=eau&theme=b',
    );
  });

  it('laisse la racine intacte — next-intl y préfixera la locale', () => {
    expect(withSearchParams('/', 'q=budget')).toBe('/?q=budget');
    expect(withSearchParams('/', '')).toBe('/');
  });
});
