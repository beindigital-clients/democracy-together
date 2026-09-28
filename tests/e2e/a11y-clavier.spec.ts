import { test, expect, type Page } from '@playwright/test';
import {
  parcourirAuClavier,
  sansTransitions,
  lireIndicateurDeFocus,
} from './_a11y';
import { provisionUser, chercherUtilisateur } from './_helpers';
import { SESSIONS } from './_sessions';

// F-08 — NAVIGATION AU CLAVIER SEUL (audit RGAA du 27/09, critères 10.7,
// 12.7, 12.8, 12.9, 7.3 et 7.1).
//
// L'analyse axe du gate (`a11y.spec.ts`) ne touche pas au clavier : elle lit
// le DOM d'une page au repos. Ce que ce fichier exerce, c'est ce qu'une
// personne qui ne se sert pas d'une souris FAIT : tabuler d'un bout à l'autre
// d'une page, remplir et envoyer un formulaire, ouvrir puis fermer un
// dialogue. Aucun `click()` ici — un clic ferait passer un parcours que le
// clavier ne permet pas.

test.use({ locale: 'fr-FR' });

/** Tabule jusqu'à l'élément dont le nom accessible correspond. */
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
// 1. Lien d'évitement (RGAA 12.7)
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
      // Visible à la prise de focus : un lien d'évitement qui reste
      // `sr-only` ne sert qu'aux lecteurs d'écran.
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
// 2. Parcours complet : ordre, focus visible, pas de piège (10.7, 12.8, 12.9)
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
      // RGAA 12.9 : la tabulation rend la main au navigateur en fin de page,
      // au lieu de tourner en rond dans un sous-ensemble.
      expect(finAtteinte, 'piège au clavier').toBe(true);
      // RGAA 10.7 : chaque arrêt montre son focus.
      expect(
        arrets
          .filter((a) => a.indicateur.length === 0)
          .map((a) => `${a.balise} « ${a.nom} »`),
        'éléments sans indicateur de focus',
      ).toEqual([]);
      // Un élément masqué qui reçoit le focus : la personne ne voit pas où
      // elle est.
      expect(
        arrets.filter((a) => a.cache).map((a) => `${a.balise} « ${a.nom} »`),
        'focus sur un élément masqué',
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Formulaires clés, au clavier seul (RGAA 7.3, 11.10, 12.8)
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

    // Filtré : Next pose sa propre région `alert` vide, l'annonceur de route.
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible(
      { timeout: 15_000 },
    );
    // Le focus ne retombe pas sur <body> : la personne reste dans le
    // formulaire, prête à corriger.
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
    // Le bouton radio est masqué : c'est sa pastille qui doit porter le focus
    // (correctif RGAA 10.7 du 27/09).
    expect(arret.indicateur, 'focus visible sur la pastille').not.toEqual([]);

    await expect(page.getByLabel('Nom du think tank')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: 'Chercheur / individuel' }),
    ).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// 4. Dialogues : Échap ferme, le focus revient au déclencheur (RGAA 7.1, 12.9)
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

    // Modal : la tabulation reste DANS le dialogue (c'est voulu, et Échap en
    // sort — ce n'est donc pas un piège au sens de 12.9).
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

      // Maj+Tab depuis le premier élément : on reste dans le panneau.
      await page.keyboard.press('Shift+Tab');
      expect(await focusDans(page, '#mobile-nav')).toBe(true);

      await page.keyboard.press('Escape');
      await expect(panneau).toHaveCount(0);
      const bouton = page.getByRole('button', { name: 'Ouvrir le menu' });
      await expect(bouton).toBeFocused();
      await expect(bouton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test('globe : la rotation automatique s’arrête au clavier (RGAA 13.8)', async ({
    page,
  }) => {
    await page.goto('/fr/barometre');
    await tabulerJusqua(page, /rotation du globe/);
    const avant = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    );
    await page.keyboard.press('Enter');
    const apres = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    );
    expect(apres).not.toBe(avant);
    expect([avant, apres].sort()).toEqual([
      'Lancer la rotation du globe',
      'Mettre en pause la rotation du globe',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Espace connecté : dialogue de confirmation du back-office
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

    // Au clavier : focus sur la liste, flèche vers le haut (« Visiteur »).
    await liste.focus();
    await page.keyboard.press('ArrowUp');
    const appliquer = ligne.getByRole('button', { name: 'Appliquer' });
    await expect(appliquer).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(appliquer).toBeFocused();
    await page.keyboard.press('Enter');

    const dialogue = page.getByRole('dialog', {
      name: `Changer le rôle de ${email} ?`,
    });
    await expect(dialogue).toBeVisible();
    // Sur une boîte qui protège d'un geste irréversible, Entrée ne doit pas
    // valider : le focus est sur l'annulation.
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
