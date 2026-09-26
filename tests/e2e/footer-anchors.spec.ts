import { test, expect, type Page } from '@playwright/test';

// Issue #46 — sous « Le réseau », le pied de page proposait trois entrées —
// « Mission & vision », « Gouvernance », « Fondateurs » — qui pointaient toutes
// les trois vers `/a-propos` NU. Trois libellés, une seule destination, en haut
// d'une page longue : au visiteur de retrouver la section lui-même.
//
// Ce que cette spec voit et que les tests unitaires ne voient pas :
//
//  1. le saut d'ancre tel qu'il se produit vraiment, c'est-à-dire par une
//     navigation CLIENTE de l'App Router — et non par le fragment natif du
//     navigateur. C'est toute la difficulté : depuis Next 16, le gestionnaire
//     de défilement défile vers l'ancre mais « laisse le focus intact » ;
//  2. le FOCUS qui en résulte, la seule mesure qui dise si le lien sert à
//     quelque chose au clavier et au lecteur d'écran ;
//  3. la position réelle de la section une fois posée, sous un en-tête collant.

// En-tête collant : `h-16` (64 px). Les sections ciblées portent `scroll-mt-20`
// (80 px), donc le haut de la section doit se poser à ~80 px du haut de la
// fenêtre — sous l'en-tête, jamais dessous. La tolérance absorbe l'arrondi du
// défilement.
const HAUT_ATTENDU = 80;
const TOLERANCE = 8;

// TRACER LE PREMIER ESSAI, PAS LA REPRISE. La configuration du dépôt capture
// la trace `on-first-retry` : sur un test INSTABLE — qui échoue puis passe —
// l'artefact publié est donc celui de l'exécution RÉUSSIE, et l'échec ne
// laisse rien. C'est ce qui s'est produit le 26/09 : le rapport contenait le
// déroulé complet d'un parcours vert, et pas une image de la panne.
//
// `retain-on-failure` enregistre chaque essai et ne garde que ceux qui
// échouent. Posé sur CE fichier seulement : le coût est celui de ses sept
// parcours, pas celui de la suite entière.
test.use({ trace: 'retain-on-failure' });

// Les `id` sont ceux du composant de page, communs aux deux langues ; seuls les
// libellés du pied de page sont traduits.
const ANCRES = {
  fr: [
    { libelle: 'Mission & vision', id: 'vision' },
    { libelle: 'Gouvernance', id: 'gouvernance' },
    { libelle: 'Fondateurs', id: 'fondateurs' },
  ],
  en: [
    { libelle: 'Mission & vision', id: 'vision' },
    { libelle: 'Governance', id: 'gouvernance' },
    { libelle: 'Founders', id: 'fondateurs' },
  ],
} as const;

function lienDuPiedDePage(page: Page, libelle: string) {
  return page
    .locator('footer')
    .getByRole('link', { name: libelle, exact: true });
}

// Qui détient le focus, dit en clair. `toBeFocused()` ne sait répondre que
// « inactive » : la section n'a pas le focus, sans dire où il est allé. Or
// c'est exactement ce que la panne du 26/09 n'a pas permis de trancher — focus
// JAMAIS POSÉ (l'écouteur d'`AnchorFocus` manquait au moment du clic) ou POSÉ
// PUIS PERDU (le routeur l'a déplacé après coup). Les deux se corrigent à des
// endroits différents.
//
// L'assertion ne s'affaiblit pas : `activeElement` doit ÊTRE la section, comme
// avant. Elle nomme seulement le coupable quand ce n'est pas le cas.
async function focusCourant(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'aucun';
    return (
      a.id || a.getAttribute('href') || a.tagName.toLowerCase() || 'sans nom'
    );
  });
}

// Le focus est posé par le composant client, le défilement par le routeur : sur
// un clic visant la page courante, le premier précède le second. On attend donc
// les deux, plutôt que de supposer qu'ils arrivent ensemble.
async function attendLeSautDAncre(page: Page, id: string): Promise<void> {
  const section = page.locator(`#${id}`);

  await expect
    .poll(() => focusCourant(page), {
      message: `le focus doit suivre l’ancre #${id} — élément focalisé`,
    })
    .toBe(id);

  const haut = () =>
    section.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await expect.poll(haut).toBeLessThanOrEqual(HAUT_ATTENDU + TOLERANCE);
  expect(
    await haut(),
    'la section doit se poser SOUS l’en-tête collant (scroll-mt-20)',
  ).toBeGreaterThanOrEqual(HAUT_ATTENDU - TOLERANCE);
}

for (const locale of ['fr', 'en'] as const) {
  test.describe(`pied de page -> sections de /a-propos (${locale})`, () => {
    for (const { libelle, id } of ANCRES[locale]) {
      test(`« ${libelle} » mène à sa section depuis une autre page`, async ({
        page,
      }) => {
        await page.goto(`/${locale}/adhesion`);
        await lienDuPiedDePage(page, libelle).click();

        await expect(page).toHaveURL(new RegExp(`/${locale}/a-propos#${id}$`));
        await attendLeSautDAncre(page, id);
      });
    }

    // Le pied de page est rendu sur TOUTES les pages, `/a-propos` comprise. Ce
    // cas-là ne remonte pas l'arbre React et n'émet aucun `hashchange` (Next
    // passe par `history.pushState`) : rien ne se rejoue tout seul.
    test('les trois liens fonctionnent aussi depuis /a-propos', async ({
      page,
    }) => {
      await page.goto(`/${locale}/a-propos`);
      for (const { libelle, id } of ANCRES[locale]) {
        await lienDuPiedDePage(page, libelle).click();
        await expect(page).toHaveURL(new RegExp(`#${id}$`));
        await attendLeSautDAncre(page, id);
      }
    });

    test("au chargement direct de l'URL ancrée", async ({ page }) => {
      await page.goto(`/${locale}/a-propos#gouvernance`);
      await attendLeSautDAncre(page, 'gouvernance');
    });
  });
}

test.describe('prefers-reduced-motion : l’ancre ne contourne pas la préférence', () => {
  // `reducedMotion` n'est pas une option de `test.use` dans la version épinglée
  // de Playwright (cf. TESTING.md) : elle est posée à la création du contexte.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('le défilement reste instantané, et le saut fonctionne', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');

    // On réclame explicitement un défilement animé. La règle globale de
    // `globals.css` (`scroll-behavior: auto !important` sous la préférence) doit
    // l'emporter : c'est elle qui gouverne le saut d'ancre, puisque celui-ci est
    // opéré par le NAVIGATEUR et non par un `scrollIntoView` animé maison.
    await page.addStyleTag({ content: 'html { scroll-behavior: smooth; }' });
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
      )
      .toBe('auto');

    await lienDuPiedDePage(page, 'Gouvernance').click();
    await attendLeSautDAncre(page, 'gouvernance');
  });
});

// Témoin du test précédent : sans la préférence, la même feuille prend effet.
// Sans lui, l'assertion `auto` passerait tout aussi bien si `addStyleTag`
// n'avait rien fait — elle ne prouverait alors plus rien.
test('témoin : sans la préférence, une feuille « smooth » prend effet', async ({
  page,
}) => {
  await page.goto('/fr/a-propos');
  await page.addStyleTag({ content: 'html { scroll-behavior: smooth; }' });
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    )
    .toBe('smooth');
});

// Garde-fou demandé par l'issue (§ « Vérification plus large ») : plusieurs
// libellés qui mènent au même endroit, c'est la forme exacte du défaut corrigé
// ici. Le pied de page est présent sur toutes les pages — il ne coûte rien de
// vérifier qu'aucune autre de ses entrées ne promet une destination qu'elle ne
// tient pas.
//
// Portée : le PIED DE PAGE. L'en-tête a été contrôlé au navigateur et est sain,
// mais son bouton « Rejoindre » vise `/adhesion` comme l'entrée « Adhérer » du
// pied de page : un appel à l'action et une entrée de navigation ont le droit de
// partager une destination. L'y soumettre ferait échouer la garde sur un cas
// légitime — et le rendu de ce bouton dépend de l'état d'authentification, donc
// de Convex.
for (const locale of ['fr', 'en'] as const) {
  test(`pied de page : pas deux libellés pour une même destination (${locale})`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);

    const liens = await page.locator('footer a[href]').evaluateAll((els) =>
      els.map((el) => ({
        href: el.getAttribute('href') ?? '',
        nom:
          (el.textContent ?? '').trim() || el.getAttribute('aria-label') || '',
      })),
    );
    // Le pied de page rend 22 liens ; le seuil dit seulement qu'on a bien
    // regardé quelque chose, pour qu'un sélecteur devenu muet ne passe pas pour
    // un pied de page sain.
    expect(liens.length).toBeGreaterThan(15);

    const parDestination = new Map<string, Set<string>>();
    for (const { href, nom } of liens) {
      const noms = parDestination.get(href) ?? new Set<string>();
      noms.add(nom);
      parDestination.set(href, noms);
    }

    const promessesConcurrentes = [...parDestination]
      .filter(([, noms]) => noms.size > 1)
      .map(([href, noms]) => `${href} <- ${[...noms].join(' | ')}`);
    expect(promessesConcurrentes).toEqual([]);
  });
}
