import { describe, it, expect } from 'vitest';
import { withSearchParams } from '@/i18n/href';

// Le sélecteur de langue perdait la query string (issue #35) : c'est ici que
// se joue la conservation des filtres au changement de locale. Le reste du
// chemin — préfixe /fr ou /en — appartient à next-intl.

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
    // Un aller-retour par `Object.fromEntries` écraserait le premier `theme`
    // et pourrait réordonner les clés : la query est donc passée en chaîne.
    expect(withSearchParams('/recherche', 'theme=a&q=eau&theme=b')).toBe(
      '/recherche?theme=a&q=eau&theme=b',
    );
  });

  it('laisse la racine intacte — next-intl y préfixera la locale', () => {
    expect(withSearchParams('/', 'q=budget')).toBe('/?q=budget');
    expect(withSearchParams('/', '')).toBe('/');
  });
});
