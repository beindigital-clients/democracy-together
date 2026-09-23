// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PortableText } from 'next-sanity';
import { ptComponents } from '@/components/news/portable-text';
import { safeHref } from '@/lib/safe-href';

afterEach(cleanup);

// LIENS VENUS DU CMS ET DE L'ANNUAIRE (pentest M-9).
//
// Le rapport d'audit classait M-9 « non vérifié », au motif qu'il faudrait un
// Sanity peuplé. Il n'en faut pas : la défense n'est pas dans le CMS, elle est
// dans le RENDU — donc dans un composant, et un composant se rend ici. Ce
// fichier passe par le vrai `<PortableText>` et le vrai `ptComponents`, celui
// que la page importe : un objet recopié dans le test ne prouverait que sa
// propre cohérence.

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

// Ce que le pentest visait, plus les variantes qu'un test de préfixe écrit à
// la main laisserait passer : casse mélangée, espace de tête, tabulation
// INSÉRÉE DANS le schéma (l'analyseur d'URL des navigateurs la retire, donc
// `java\tscript:` s'exécute — mais `'java\tscript:'.startsWith('javascript:')`
// est faux).
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
      // Pas un `<a>` sans href — un `<a>` sans href est un lien mort,
      // cliquable et silencieux. C'est un `<span>`.
      expect(noeud.tagName, `schéma passé : ${JSON.stringify(href)}`).toBe(
        'SPAN',
      );
      expect(document.querySelector('a')).toBeNull();
      // Le texte de l'auteur, lui, n'est pas censuré : on retire la
      // navigation, pas le contenu.
      expect(noeud.textContent).toBe(TEXTE);
      cleanup();
    }
  });

  it('un schéma autorisé produit bien un lien — sinon ce test ne mesurerait rien', () => {
    const AUTORISES = [
      'https://exemple.test/article',
      'http://exemple.test/article',
      'mailto:contact@democracytogether.test',
      '/fr/actualites', // relatif : un lien interne reste un lien
      '#section', // ancre
    ];
    for (const href of AUTORISES) {
      const noeud = rendu(href);
      expect(noeud.tagName, `schéma refusé à tort : ${href}`).toBe('A');
      expect(noeud.getAttribute('href')).toBe(href);
      // Ces liens sortent vers des domaines que le réseau ne contrôle pas.
      expect(noeud.getAttribute('rel')).toBe('noopener noreferrer');
      cleanup();
    }
  });

  it("React ne couvre QUE `javascript:` — c'est pourquoi la liste est blanche", () => {
    // Mesure, pas supposition : ce que fait React 19 si on lui passe l'URL
    // brute, sans le filtre. C'est l'état d'avant la correction.
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

      // Celui-là, React le neutralise lui-même.
      expect(document.querySelector('#js')?.getAttribute('href')).toMatch(
        /^javascript:throw/,
      );
      // Les deux autres arrivent TELS QUELS jusqu'au DOM.
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

// L'autre point de rendu du même défaut : `websiteUrl` d'une fiche d'annuaire,
// posé tel quel dans un `href` par /le-reseau/[slug]. Même filtre, et il est
// testé ici parce que c'est la même propriété — pas parce que c'est le même
// écran.
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
    // Les espaces de tête et de queue partent : le navigateur, lui, ne les
    // retirerait pas d'une URL relative, et le lien pointerait à côté.
    expect(safeHref('  https://institut-x.org  ')).toBe(
      'https://institut-x.org',
    );
  });

  it('refuse ce qui n’est pas une chaîne, et la chaîne vide', () => {
    // `value.href` d'une annotation Sanity est facultatif : un lien dont
    // l'URL n'a jamais été saisie arrive `undefined`.
    expect(safeHref(undefined)).toBe(undefined);
    expect(safeHref(null)).toBe(undefined);
    expect(safeHref(42)).toBe(undefined);
    expect(safeHref('   ')).toBe(undefined);
  });
});
