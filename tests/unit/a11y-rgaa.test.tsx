// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import { StatusMessage } from '@/components/a11y/status-message';
import { contentLangAttrs, textAttrs } from '@/i18n/content-lang';
import { adminScreenKey } from '@/components/admin/admin-nav';
import { RegionGlobe } from '@/components/map/region-globe';
import { SolidarityEstimator } from '@/components/membership/solidarity-estimator';
import { getMembershipContent } from '@/lib/membership-content';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { getLegalContent } from '@/lib/legal-content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixes from the RGAA audit of 27/09 (F-08) — what can be checked without a
// browser. The real flow (keyboard, announcements, display) is covered by
// `tests/e2e/a11y-clavier`, `a11y-annonces` and `a11y-affichage`.

// No global setupFiles in this project (see directory-fields.test.tsx).
afterEach(cleanup);

// The estimator reads the published rate scale (F-27) via `useQuery`, outside any
// ConvexProvider here: we simulate an UNPUBLISHED scale, which makes the estimate
// indicative — the choice cards, the only target, are the same in both
// cases.
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('convex/react')>()),
  useQuery: () => undefined,
}));

// The estimator translates its payment notices (`payments`): it needs the
// catalog, as on the /adhesion page.
function renderEstimator() {
  const content = getMembershipContent('fr').estimator;
  const view = render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <SolidarityEstimator content={content} locale="fr" />
    </NextIntlClientProvider>,
  );
  return { content, container: view.container };
}

describe('StatusMessage — confirmation qui remplace un formulaire (RGAA 7.5)', () => {
  it('prend le focus à son apparition, et reste une région status', () => {
    render(
      <div>
        <button type="button">avant</button>
        <StatusMessage className="x">Message envoyé</StatusMessage>
      </div>,
    );
    const statut = screen.getByRole('status');
    expect(statut.textContent).toBe('Message envoyé');
    // Without this, the vanished submit button left focus on <body>.
    expect(document.activeElement).toBe(statut);
    // Focusable by script, outside the tab sequence.
    expect(statut.getAttribute('tabindex')).toBe('-1');
  });

  it('peut être un paragraphe ou un span', () => {
    render(<StatusMessage as="span">Signalé</StatusMessage>);
    expect(screen.getByRole('status').tagName).toBe('SPAN');
  });
});

describe('langue des contenus dans une page d’une autre langue (RGAA 8.7, 8.10)', () => {
  it('rien quand le contenu est dans la langue de la page', () => {
    expect(textAttrs('fr', 'fr')).toEqual({});
    expect(contentLangAttrs('ar', 'ar')).toEqual({});
  });

  it('lang ET sens d’écriture quand la langue diffère', () => {
    expect(contentLangAttrs('fr', 'ar')).toEqual({ lang: 'fr', dir: 'ltr' });
    expect(contentLangAttrs('ar', 'fr')).toEqual({ lang: 'ar', dir: 'rtl' });
  });

  it('langue absente ou inconnue : le français, comme la fiche', () => {
    expect(contentLangAttrs(undefined, 'ar')).toEqual({
      lang: 'fr',
      dir: 'ltr',
    });
    expect(contentLangAttrs('de', 'fr')).toEqual({});
  });
});

describe('titre de page du back-office (RGAA 8.6)', () => {
  it('nomme l’écran d’après le menu', () => {
    expect(adminScreenKey('/admin')).toBe('dashboard');
    expect(adminScreenKey('/admin/utilisateurs')).toBe('users');
    expect(adminScreenKey('/admin/publications/en-attente')).toBe(
      'publications',
    );
    expect(adminScreenKey('/admin/journal/')).toBe('journal');
  });

  it('hors du menu : pas de nom d’écran inventé', () => {
    expect(adminScreenKey('/espace-membre')).toBeNull();
  });

  it('chaque écran du menu a un libellé dans les messages', () => {
    for (const chemin of ['/admin', '/admin/utilisateurs', '/admin/revue']) {
      const cle = adminScreenKey(chemin)!;
      expect(fr.admin[cle as keyof typeof fr.admin]).toBeTruthy();
    }
  });
});

describe('globe : rotation automatique sans bouton pause', () => {
  const items = [
    {
      name: 'Senegal',
      region: 'afrique' as const,
      fill: '#123456',
      title: 'Sénégal',
      rows: [{ label: 'Indice', value: '0,62' }],
    },
  ];

  // Client decision (28/09): the pause button weighed on the globe and was
  // removed; hovering or dragging stops the rotation, and the system
  // reduced-motion preference keeps it still. RGAA 13.8 is non-compliant
  // again as a result (accessibility statement).
  it('aucune commande de rotation n’est affichée sur le globe', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <RegionGlobe
          items={items}
          hint="Survolez un pays"
          ariaLabel="Régions"
          variant="compact"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('button', { name: /rotation/i })).toBeNull();
  });
});

describe('estimateur solidaire : sélection et focus visibles (RGAA 3.1, 10.7)', () => {
  it('l’option choisie porte une coche, pas seulement une couleur', () => {
    const { content, container } = renderEstimator();
    const coches = () =>
      [...container.querySelectorAll('label')].filter((l) =>
        l.querySelector('svg[aria-hidden="true"]'),
      );
    // One checkmark per group: income and type.
    expect(coches()).toHaveLength(2);
    const autre = screen.getByRole('radio', {
      name: new RegExp(content.incomes[1].label),
    });
    fireEvent.click(autre);
    expect(coches()).toHaveLength(2);
    expect(autre.closest('label')?.querySelector('svg')).not.toBeNull();
  });

  it('la carte (et non le bouton radio masqué) porte le style de focus', () => {
    renderEstimator();
    const radio = screen.getAllByRole('radio')[0];
    expect(radio.className).toContain('sr-only');
    expect(radio.closest('label')?.className).toContain(
      'has-[:focus-visible]:outline',
    );
  });
});

describe('champs de formulaire : focus et limite visibles (RGAA 10.7, 3.3)', () => {
  it('aucun ne retire le contour de focus ; la bordure atteint 3:1', () => {
    render(
      <div>
        <Input aria-label="a" />
        <Textarea aria-label="b" />
        <Select>
          <SelectTrigger aria-label="c">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="x">x</SelectItem>
          </SelectContent>
        </Select>
        <NativeSelect aria-label="d">
          <NativeSelectOption>x</NativeSelectOption>
        </NativeSelect>
      </div>,
    );
    for (const nom of ['a', 'b', 'c', 'd']) {
      const el = screen.getByLabelText(nom);
      expect(el.className, nom).not.toContain('outline-none');
      expect(el.className, nom).toContain('border-line-field');
    }
  });
});

// ---------------------------------------------------------------------------
// Accessibility statement (RGAA): complete, in all five languages, and
// FAITHFUL to the audit grid — the displayed rate is recomputed here from
// `docs/rgaa/grille.csv`, using the RGAA method.

function lireCsv(texte: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === ',') {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else {
      champ += c;
    }
  }
  if (champ || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

describe('déclaration d’accessibilité (RGAA)', () => {
  const [entete, ...criteres] = lireCsv(
    readFileSync(join(process.cwd(), 'docs/rgaa/grille.csv'), 'utf8'),
  );
  const col = entete.indexOf('global_avant');
  const statuts = criteres.map((l) => l[col]);
  const c = statuts.filter((s) => s === 'C').length;
  const nc = statuts.filter((s) => s === 'NC').length;
  const taux = ((100 * c) / (c + nc)).toFixed(1);

  it('la grille couvre les 106 critères', () => {
    expect(criteres).toHaveLength(106);
  });

  it.each(['fr', 'en', 'es', 'pt', 'ar'])(
    '%s : état, taux mesuré, non-conformités, contact, recours',
    (locale) => {
      const doc = getLegalContent('accessibilite', locale);
      const texte = JSON.stringify(doc);
      // The MEASURED rate, to the decimal (comma or point depending on the language).
      expect(texte).toMatch(new RegExp(taux.replace('.', '[.,]')));
      expect(texte).toContain(String(nc));
      // Between 50 and 100 %: "partiellement conforme" (RGAA method).
      expect(Number(taux)).toBeGreaterThanOrEqual(50);
      expect(Number(taux)).toBeLessThan(100);
      // The enumerations are LISTS, and they cite the criteria.
      const listes = doc.sections.filter((s) => s.items?.length);
      expect(listes.length).toBeGreaterThanOrEqual(3);
      expect(texte).toContain('13.8');
      expect(texte).toContain('www.defenseurdesdroits.fr');
      expect(texte).toContain('Libre réponse 71120');
      expect(texte).toContain('HTML5');
      expect(texte).toContain('Chromium');
    },
  );

  it('le français dit « partiellement conforme » et ne prétend pas avoir testé les lecteurs d’écran', () => {
    const texte = JSON.stringify(getLegalContent('accessibilite', 'fr'));
    expect(texte).toContain('partiellement conforme');
    expect(texte).toContain('n’a pas encore été testée');
  });
});
