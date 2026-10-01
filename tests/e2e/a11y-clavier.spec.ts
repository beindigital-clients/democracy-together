import { test, expect, type Page } from '@playwright/test';
import {
  parcourirAuClavier,
  sansTransitions,
  lireIndicateurDeFocus,
} from './_a11y';
import { provisionUser, chercherUtilisateur } from './_helpers';
import { SESSIONS } from './_sessions';

// F-08 — KEYBOARD-ONLY NAVIGATION (RGAA audit of 27/09, criteria 10.7,
// 12.7, 12.8, 12.9, 7.3 and 7.1).
//
// The gate's axe analysis (`a11y.spec.ts`) does not touch the keyboard: it reads
// the DOM of a page at rest. What this file exercises is what a
// person who does not use a mouse DOES: tab from one end of a page
// to the other, fill in and submit a form, open then close a
// dialog. No `click()` here — a click would let through a journey the
// keyboard does not allow.

test.use({ locale: 'fr-FR' });

/** Tabs until the element whose accessible name matches. */
async function tabulerJusqua(page: Page, nom: RegExp, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const actuel = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      if (!el) return '';
      return (
        el.getAttribute('aria-label') ||
        el.labels?.[0]?.textContent ||
        el.textContent ||
        ''
      ).trim();
    });
    if (nom.test(actuel)) return;
  }
  throw new Error(`Focus jamais atteint au clavier : ${nom}`);
}

function focusDans(page: Page, selecteur: string) {
  return page.evaluate(
    (sel) => !!document.activeElement?.closest(sel),
    selecteur,
  );
}

// ---------------------------------------------------------------------------
// 1. Skip link (RGAA 12.7)
// ---------------------------------------------------------------------------

test.describe("lien d'évitement (RGAA 12.7)", () => {
  for (const [chemin, nom] of [
    ['/fr', 'Aller au contenu'],
    ['/fr/bibliotheque', 'Aller au contenu'],
    ['/ar/barometre', 'الانتقال إلى المحتوى'],
  ] as const) {
    test(`${chemin} : premier arrêt, visible, et mène au contenu`, async ({
      page,
    }) => {
      await page.goto(chemin);
      await page.keyboard.press('Tab');
      const lien = page.getByRole('link', { name: nom });
      await expect(lien).toBeFocused();
      // Visible on focus: a skip link that stays
      // `sr-only` only serves screen readers.
      const boite = await lien.boundingBox();
      expect(boite?.width ?? 0).toBeGreaterThan(40);
      expect(boite?.height ?? 0).toBeGreaterThan(20);

      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      expect(
        await focusDans(page, 'main'),
        'après le lien, la tabulation reprend DANS le contenu principal',
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Full journey: order, visible focus, no trap (10.7, 12.8, 12.9)
// ---------------------------------------------------------------------------

const PAGES = [
  '/fr',
  '/fr/a-propos',
  '/fr/le-reseau',
  '/fr/le-reseau/accra-governance-lab',
  '/fr/bibliotheque',
  '/fr/bibliotheque/etat-democratie-afrique-europe',
  '/fr/evenements',
  '/fr/tribune',
  '/fr/jeunes',
  '/fr/barometre',
  '/fr/rapports/2026',
  '/fr/adhesion',
  '/fr/contact',
  '/fr/connexion',
  '/fr/accessibilite',
  '/ar',
  '/ar/adhesion',
];

test.describe('parcours complet à la tabulation', () => {
  for (const chemin of PAGES) {
    test(`${chemin} : chaque arrêt est visible, la séquence se termine`, async ({
      page,
    }) => {
      await page.goto(chemin);
      await sansTransitions(page);
      const { arrets, finAtteinte } = await parcourirAuClavier(page);

      expect(arrets.length, 'au moins un élément focalisable').toBeGreaterThan(
        5,
      );
      // RGAA 12.9: tabbing hands control back to the browser at the end of the page,
      // instead of going round in circles within a subset.
      expect(finAtteinte, 'piège au clavier').toBe(true);
      // RGAA 10.7: every stop shows its focus.
      expect(
        arrets
          .filter((a) => a.indicateur.length === 0)
          .map((a) => `${a.balise} « ${a.nom} »`),
        'éléments sans indicateur de focus',
      ).toEqual([]);
      // A hidden element receiving focus: the person cannot see where
      // they are.
      expect(
        arrets.filter((a) => a.cache).map((a) => `${a.balise} « ${a.nom} »`),
        'focus sur un élément masqué',
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Key forms, keyboard only (RGAA 7.3, 11.10, 12.8)
// ---------------------------------------------------------------------------

test.describe('formulaires au clavier seul', () => {
  test('connexion : saisie, envoi à Entrée, erreur annoncée, focus conservé', async ({
    page,
  }) => {
    await page.goto('/fr/connexion');
    await tabulerJusqua(page, /^E-mail$/);
    await page.keyboard.type('personne-inconnue-a11y@democracytogether.test');
    await page.keyboard.press('Tab');
    await expect(
      page.getByLabel('Mot de passe', { exact: true }),
    ).toBeFocused();
    await page.keyboard.type('mauvaise-phrase-de-passe');
    await page.keyboard.press('Enter');

    // Filtered: Next sets its own empty `alert` region, the route announcer.
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible(
      { timeout: 15_000 },
    );
    // Focus does not fall back to <body>: the person stays in the
    // form, ready to correct.
    expect(await focusDans(page, 'main')).toBe(true);
  });

  test('contact : envoi vide à Entrée, le focus va au premier champ fautif', async ({
    page,
  }) => {
    await page.goto('/fr/contact');
    await tabulerJusqua(page, /^Nom$/);
    await page.keyboard.press('Enter');

    const nom = page.getByLabel('Nom', { exact: true });
    await expect(nom).toBeFocused();
    await expect(nom).toHaveAttribute('aria-invalid', 'true');
  });

  test('adhésion : le type se choisit aux flèches, et le choix se voit', async ({
    page,
  }) => {
    await page.goto('/fr/adhesion');
    await sansTransitions(page);
    await tabulerJusqua(page, /Think tank \/ organisation/);
    const arret = await lireIndicateurDeFocus(page);
    // The radio button is hidden: it is its dot that must carry the focus
    // (RGAA 10.7 fix of 27/09).
    expect(arret.indicateur, 'focus visible sur la pastille').not.toEqual([]);

    await expect(page.getByLabel('Nom du think tank')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: 'Chercheur / individuel' }),
    ).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// 4. Dialogs: Escape closes, focus returns to the trigger (RGAA 7.1, 12.9)
// ---------------------------------------------------------------------------

test.describe('dialogues et menus', () => {
  test('palette de recherche : ouverture au clavier, piège voulu, Échap', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    await tabulerJusqua(page, /^Recherche$/);
    const declencheur = page.getByRole('button', { name: 'Recherche' });
    await page.keyboard.press('Enter');

    const dialogue = page.getByRole('dialog', {
      name: 'Rechercher sur le site',
    });
    await expect(dialogue).toBeVisible();
    await expect(dialogue.getByRole('combobox')).toBeFocused();

    // Modal: tabbing stays WITHIN the dialog (this is intended, and Escape
    // exits it — so it is not a trap in the sense of 12.9).
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await focusDans(page, '[role="dialog"]')).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialogue).toHaveCount(0);
    await expect(declencheur).toBeFocused();
  });

  test('palette de recherche : Ctrl+K ouvre, les flèches parcourent les résultats', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    await page.keyboard.press('Control+k');
    const champ = page.getByRole('combobox', {
      name: 'Publication, membre, actualité…',
    });
    await expect(champ).toBeFocused();
    await page.keyboard.type('democratie');
    await expect(page.getByRole('option').first()).toBeVisible({
      timeout: 15_000,
    });
    const avant = await champ.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    await expect(champ).not.toHaveAttribute(
      'aria-activedescendant',
      avant ?? '',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('sélecteur de langue : Entrée ouvre, flèches, Échap rend le focus', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    await tabulerJusqua(page, /Langue/);
    const bouton = page.getByRole('button', { name: /Langue/ });
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('menuitemradio', { name: 'Français' }),
    ).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      menu.getByRole('menuitemradio', { name: 'English' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(bouton).toBeFocused();
    await expect(page).toHaveURL(/\/fr\/a-propos$/);
  });

  test.describe('menu mobile', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('Entrée ouvre, le focus boucle dans le panneau, Échap le rend au bouton', async ({
      page,
    }) => {
      await page.goto('/fr/a-propos');
      await tabulerJusqua(page, /Ouvrir le menu/);
      await page.keyboard.press('Enter');
      const panneau = page.getByRole('dialog', { name: 'Menu' });
      await expect(panneau).toBeVisible();
      expect(await focusDans(page, '#mobile-nav')).toBe(true);

      // Shift+Tab from the first element: we stay in the panel.
      await page.keyboard.press('Shift+Tab');
      expect(await focusDans(page, '#mobile-nav')).toBe(true);

      await page.keyboard.press('Escape');
      await expect(panneau).toHaveCount(0);
      const bouton = page.getByRole('button', { name: 'Ouvrir le menu' });
      await expect(bouton).toBeFocused();
      await expect(bouton).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Signed-in area: back-office confirmation dialog
// ---------------------------------------------------------------------------

test.describe('back-office', () => {
  test.use({ storageState: SESSIONS.a11yClavier.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.a11yClavier.state });
  });

  test('changer un rôle : le focus va sur « Annuler », Échap rend le focus à « Appliquer »', async ({
    page,
  }) => {
    const email = `e2e_a11y_cible_${Date.now()}@democracytogether.test`;
    await provisionUser(email, 'membre');
    await page.goto('/fr/admin/utilisateurs');
    await chercherUtilisateur(page, email);
    const ligne = page.getByRole('row').filter({ hasText: email });
    const liste = ligne.getByLabel(`Rôle ${email}`);
    await expect(liste).toBeVisible();

    // With the keyboard: on the list's button, an arrow opens the list on
    // the current role, the next arrow up reaches "Visiteur", Enter picks it
    // and gives the focus back to the button.
    await liste.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('listbox')).toBeVisible();
    // The list puts the focus on the CURRENT role once it is placed: a
    // person sees that highlight before pressing again. Pressed earlier,
    // the arrow is lost and Enter re-picks "Membre" (measured in CI).
    await expect(page.getByRole('option', { name: 'Membre' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('option', { name: 'Visiteur' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(liste).toHaveText('Visiteur');
    await expect(liste).toBeFocused();
    const appliquer = ligne.getByRole('button', { name: 'Appliquer' });
    await expect(appliquer).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(appliquer).toBeFocused();
    await page.keyboard.press('Enter');

    const dialogue = page.getByRole('dialog', {
      name: `Changer le rôle de ${email} ?`,
    });
    await expect(dialogue).toBeVisible();
    // On a dialog guarding an irreversible action, Enter must not
    // confirm: focus is on the cancel button.
    await expect(
      dialogue.getByRole('button', { name: 'Annuler' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogue).toHaveCount(0);
    await expect(appliquer).toBeFocused();
  });

  test('espace membre et écran d’administration : parcours complet sans piège', async ({
    page,
  }) => {
    for (const chemin of ['/fr/espace-membre', '/fr/admin/utilisateurs']) {
      await page.goto(chemin);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await sansTransitions(page);
      const { arrets, finAtteinte } = await parcourirAuClavier(page, 400);
      expect(finAtteinte, `${chemin} : piège au clavier`).toBe(true);
      expect(
        arrets
          .filter((a) => a.indicateur.length === 0 || a.cache)
          .map((a) => `${a.balise} « ${a.nom} »`),
        `${chemin} : focus invisible`,
      ).toEqual([]);
    }
  });
});
