// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PortableText } from 'next-sanity';
import { ptComponents } from '@/components/news/portable-text';
import { safeHref } from '@/lib/safe-href';

afterEach(cleanup);

// LINKS COMING FROM THE CMS AND THE DIRECTORY (pentest M-9).
//
// The audit report classified M-9 as "non vérifié", on the grounds that it would require a
// populated Sanity. It does not: the defense is not in the CMS, it is
// in the RENDER — hence in a component, and a component renders here. This
// file goes through the real `<PortableText>` and the real `ptComponents`, the one
// the page imports: an object copied into the test would only prove its
// own consistency.

const TEXTE = 'le texte du lien';

function article(href: string) {
  return [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      markDefs: [{ _type: 'link', _key: 'l1', href }],
      children: [{ _type: 'span', _key: 's1', text: TEXTE, marks: ['l1'] }],
    },
  ];
}

function rendu(href: string) {
  render(
    <PortableText value={article(href) as never} components={ptComponents} />,
  );
  return screen.getByText(TEXTE);
}

// What the pentest targeted, plus the variants that a hand-written prefix test
// would let through: mixed case, leading space, tab
// INSERTED INTO the scheme (browsers' URL parser strips it, so
// `java\tscript:` executes — but `'java\tscript:'.startsWith('javascript:')`
// is false).
const REFUSES = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'DATA:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
];

describe('Texte riche — schéma des liens (pentest M-9)', () => {
  it('un schéma refusé ne produit AUCUN href : le texte reste, le lien part', () => {
    for (const href of REFUSES) {
      const noeud = rendu(href);
      // Not an `<a>` without href — an `<a>` without href is a dead link,
      // clickable and silent. It is a `<span>`.
      expect(noeud.tagName, `schéma passé : ${JSON.stringify(href)}`).toBe(
        'SPAN',
      );
      expect(document.querySelector('a')).toBeNull();
      // The author's text, however, is not censored: we remove the
      // navigation, not the content.
      expect(noeud.textContent).toBe(TEXTE);
      cleanup();
    }
  });

  it('un schéma autorisé produit bien un lien — sinon ce test ne mesurerait rien', () => {
    const AUTORISES = [
      'https://exemple.test/article',
      'http://exemple.test/article',
      'mailto:contact@democracytogether.test',
      '/fr/actualites', // relative: an internal link stays a link
      '#section', // ancre
    ];
    for (const href of AUTORISES) {
      const noeud = rendu(href);
      expect(noeud.tagName, `schéma refusé à tort : ${href}`).toBe('A');
      expect(noeud.getAttribute('href')).toBe(href);
      // These links go out to domains the network does not control.
      expect(noeud.getAttribute('rel')).toBe('noopener noreferrer');
      cleanup();
    }
  });

  it("React ne couvre QUE `javascript:` — c'est pourquoi la liste est blanche", () => {
    // Measurement, not assumption: what React 19 does if given the raw
    // URL, without the filter. This is the state before the fix.
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <div>
          <a id="js" href="javascript:alert(1)">
            a
          </a>
          <a id="data" href="data:text/html,<script>alert(1)</script>">
            b
          </a>
          <a id="vb" href="vbscript:msgbox(1)">
            c
          </a>
        </div>,
      );

      // That one, React neutralizes by itself.
      expect(document.querySelector('#js')?.getAttribute('href')).toMatch(
        /^javascript:throw/,
      );
      // The other two reach the DOM AS IS.
      expect(document.querySelector('#data')?.getAttribute('href')).toBe(
        'data:text/html,<script>alert(1)</script>',
      );
      expect(document.querySelector('#vb')?.getAttribute('href')).toBe(
        'vbscript:msgbox(1)',
      );
    } finally {
      erreurs.mockRestore();
    }
  });
});

// The other render point of the same defect: a directory profile's `websiteUrl`,
// placed as is in an `href` by /le-reseau/[slug]. Same filter, and it is
// tested here because it is the same property — not because it is the same
// screen.
describe('safeHref — la fonction partagée', () => {
  it('refuse tout schéma hors liste, accepte les trois autorisés', () => {
    for (const href of REFUSES) {
      expect(safeHref(href), `accepté à tort : ${JSON.stringify(href)}`).toBe(
        undefined,
      );
    }
    expect(safeHref('https://institut-x.org')).toBe('https://institut-x.org');
    expect(safeHref('mailto:a@b.test')).toBe('mailto:a@b.test');
  });

  it('rend la chaîne ANALYSÉE, pas la chaîne reçue', () => {
    // Leading and trailing spaces are removed: the browser would not
    // strip them from a relative URL, and the link would point elsewhere.
    expect(safeHref('  https://institut-x.org  ')).toBe(
      'https://institut-x.org',
    );
  });

  it('refuse ce qui n’est pas une chaîne, et la chaîne vide', () => {
    // A Sanity annotation's `value.href` is optional: a link whose
    // URL was never entered arrives as `undefined`.
    expect(safeHref(undefined)).toBe(undefined);
    expect(safeHref(null)).toBe(undefined);
    expect(safeHref(42)).toBe(undefined);
    expect(safeHref('   ')).toBe(undefined);
  });
});
