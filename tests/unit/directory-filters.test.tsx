// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import type { Facets } from '@/lib/orgs';

// Directory filters (F-19): four dropdown menus instead of four rows of chips.
// What these tests hold:
//  - a choice in a menu produces the expected URL, without scrolling back to
//    the top (`scroll: false`) and keeping the other filters;
//  - the button shows the active filter without opening the menu;
//  - the search field follows the URL (reset link, "Back");
//  - WITHOUT JavaScript, a form of native selects takes over.

// No global setupFiles in this project (see directory-fields.test.tsx).
afterEach(() => {
  cleanup();
  push.mockReset();
});

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  useRouter: () => ({ push, replace() {}, refresh() {} }),
}));

const { DirectoryNavigation } =
  await import('@/components/directory/directory-navigation');
const { FacetMenu } = await import('@/components/directory/facet-menu');
const { DirectorySearch } =
  await import('@/components/directory/directory-search');
const { DirectoryFilters } =
  await import('@/components/directory/directory-filters');
const { directoryHref } = await import('@/lib/orgs');

const REGIONS = [
  { value: 'afrique-ouest', label: "Afrique de l'Ouest", count: 3 },
  { value: 'europe-ouest', label: "Europe de l'Ouest", count: 3 },
];

function renderRegionMenu(filters: Record<string, string> = {}) {
  return render(
    <DirectoryNavigation>
      <FacetMenu
        param="region"
        label="Région"
        allLabel="Toutes les régions"
        total={10}
        options={REGIONS}
        filters={filters}
      />
    </DirectoryNavigation>,
  );
}

// Radix opens a menu from the keyboard (Enter, Space, ↓): it is also the
// most reliable path outside a browser.
function openMenu(name: RegExp) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
  return screen.getByRole('menu');
}

describe('Directory — filter URLs', () => {
  it('keeps the other filters and drops those set to undefined', () => {
    expect(directoryHref({})).toBe('/le-reseau');
    expect(
      directoryHref({ region: 'afrique-ouest', q: 'sahel' }, { theme: 'paix' }),
    ).toBe('/le-reseau?region=afrique-ouest&theme=paix&q=sahel');
    expect(
      directoryHref(
        { region: 'afrique-ouest', q: 'sahel' },
        { region: undefined },
      ),
    ).toBe('/le-reseau?q=sahel');
    expect(directoryHref({ q: "côte d'ivoire" })).toBe(
      '/le-reseau?q=c%C3%B4te+d%27ivoire',
    );
  });
});

describe('Directory — facet menu', () => {
  it('a choice navigates to the right URL without scrolling to the top', () => {
    renderRegionMenu({ theme: 'paix', q: 'sahel' });
    openMenu(/^Région$/);
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: /Europe de l'Ouest/ }),
    );
    expect(push).toHaveBeenCalledWith(
      '/le-reseau?region=europe-ouest&theme=paix&q=sahel',
      { scroll: false },
    );
  });

  it('the button shows the active filter and the menu checks it', () => {
    renderRegionMenu({ region: 'europe-ouest' });
    openMenu(/^Région.*Europe de l'Ouest/);
    const checked = (name: RegExp) =>
      screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked');
    expect(checked(/Europe de l'Ouest/)).toBe('true');
    expect(checked(/Toutes les régions/)).toBe('false');
  });

  it('« Toutes les régions » removes the filter; picking the active one again does not navigate', () => {
    renderRegionMenu({ region: 'europe-ouest', q: 'x' });
    openMenu(/^Région/);
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: /Europe de l'Ouest/ }),
    );
    expect(push).not.toHaveBeenCalled();

    openMenu(/^Région/);
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: /Toutes les régions/ }),
    );
    expect(push).toHaveBeenCalledWith('/le-reseau?q=x', { scroll: false });
  });
});

describe('Directory — search', () => {
  function renderSearch(filters: Record<string, string>) {
    return render(
      <DirectoryNavigation>
        <DirectorySearch
          filters={filters}
          placeholder="Rechercher un think tank…"
          cta="Rechercher"
        />
      </DirectoryNavigation>,
    );
  }

  it('submits the trimmed query and keeps the facets', () => {
    renderSearch({ region: 'afrique-ouest' });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '  Kenya ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(push).toHaveBeenCalledWith(
      '/le-reseau?region=afrique-ouest&q=Kenya',
      {
        scroll: false,
      },
    );
  });

  it('an emptied query removes the parameter', () => {
    renderSearch({ q: 'Kenya' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(push).toHaveBeenCalledWith('/le-reseau', { scroll: false });
  });

  it('follows the URL query when it changes without the field (reset)', () => {
    const { rerender } = renderSearch({ q: 'Kenya' });
    const value = () => screen.getByRole<HTMLInputElement>('searchbox').value;
    expect(value()).toBe('Kenya');
    rerender(
      <DirectoryNavigation>
        <DirectorySearch
          filters={{}}
          placeholder="Rechercher un think tank…"
          cta="Rechercher"
        />
      </DirectoryNavigation>,
    );
    expect(value()).toBe('');
  });

  it('keeps the facets as hidden inputs for the no-JavaScript submit', () => {
    const { container } = renderSearch({
      region: 'afrique-ouest',
      theme: 'paix',
    });
    const hidden = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
    ].map((i) => `${i.name}=${i.value}`);
    expect(hidden).toEqual(['region=afrique-ouest', 'theme=paix']);
  });
});

describe('Directory — full toolbar', () => {
  const FACETS: Facets = {
    regions: [
      { value: 'europe-ouest', count: 3 },
      { value: 'afrique-ouest', count: 3 },
    ],
    themes: [{ value: 'gouvernance', count: 5 }],
    countries: [
      { value: 'SN', count: 1 },
      { value: 'BE', count: 1 },
    ],
    languages: [
      { value: 'fr', count: 6 },
      { value: 'en', count: 7 },
    ],
  };

  function html(filters: Record<string, string>) {
    return renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <DirectoryNavigation>
          <DirectoryFilters facets={FACETS} filters={filters} total={10} />
        </DirectoryNavigation>
      </NextIntlClientProvider>,
    ).replaceAll('&#x27;', "'");
  }

  it('without JavaScript: menus hidden, a native select form served', () => {
    const out = html({ region: 'afrique-ouest', q: 'sahel' });
    expect(out).toMatch(/role="group"[^>]*class="[^"]*noscript:hidden/);
    const fallback = out.slice(out.indexOf('<noscript>'));
    for (const name of ['region', 'theme', 'country', 'language']) {
      expect(fallback).toMatch(new RegExp(`<select[^>]* name="${name}"`));
    }
    expect(fallback).toContain('<input type="hidden" name="q" value="sahel"/>');
    expect(fallback).toContain(
      `<option value="afrique-ouest" selected="">Afrique de l'Ouest (3)</option>`,
    );
  });

  it('sorts options by label and capitalizes languages', () => {
    const fallback = html({}).split('<noscript>')[1];
    expect(fallback.indexOf("Afrique de l'Ouest")).toBeLessThan(
      fallback.indexOf("Europe de l'Ouest"),
    );
    expect(fallback.indexOf('Belgique')).toBeLessThan(
      fallback.indexOf('Sénégal'),
    );
    expect(fallback).toContain('>Anglais (7)</option>');
    expect(fallback).toContain('>Français (6)</option>');
  });

  it('a valid filter with no member stays displayed (at zero)', () => {
    const out = html({ region: 'europe-est' });
    // on the menu button…
    expect(out).toContain("Europe de l'Est</span>");
    // … and selected in the fallback form.
    expect(out).toContain(
      `<option value="europe-est" selected="">Europe de l'Est (0)</option>`,
    );
  });
});
