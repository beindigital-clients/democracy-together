import { test, expect } from '@playwright/test';
import { expectFieldError } from './_fields';
import { SESSIONS } from './_sessions';

// F-08 — WHAT A PERSON USING A SCREEN READER HEARS (RGAA audit
// of 27/09, criteria 7.1, 7.5, 8.6, 8.7, 11.1, 11.10 and 11.9).
//
// No screen reader runs in CI. What these tests hold is
// what the screen reader READS: the browser's accessibility tree (names,
// roles, states — `ariaSnapshot`), live regions (`role=status` /
// `role=alert`), tying errors to fields, the language of blocks.
// The spoken output itself is checked by hand, following the protocol in
// `docs/rgaa/protocole-lecteurs-ecran.md`.

test.use({ locale: 'fr-FR' });

// ---------------------------------------------------------------------------
// 1. Error and success messages (RGAA 7.5, 11.10)
// ---------------------------------------------------------------------------

test.describe('messages annoncés', () => {
  test('connexion refusée : message dans une région role=alert', async ({
    page,
  }) => {
    await page.goto('/fr/connexion');
    await page.getByLabel('E-mail').fill('inconnu-a11y@democracytogether.test');
    await page
      .getByLabel('Mot de passe', { exact: true })
      .fill('mauvaise-phrase-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    // Filtered: Next sets its own empty `alert` region, the route announcer.
    const alerte = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alerte).toBeVisible({ timeout: 15_000 });
    await expect(alerte).toHaveText('E-mail ou mot de passe incorrect.');
  });

  test('contact vide : chaque champ requis est invalide ET décrit par son message', async ({
    page,
  }) => {
    await page.goto('/fr/contact');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    for (const libelle of ['Nom', 'E-mail', 'Sujet', 'Message']) {
      const champ = page.getByLabel(libelle, { exact: true });
      await expect(champ, libelle).toHaveAttribute('aria-invalid', 'true');
      // What the screen reader reads on reaching the field: its name,
      // "invalid", and the description — the error message.
      await expect(champ, libelle).not.toHaveAccessibleDescription('');
    }
    await expectFieldError(
      page,
      page.getByLabel('E-mail', { exact: true }),
      /.+/,
    );
  });

  test('contact envoyé : la confirmation est une région status, et elle a le focus', async ({
    page,
  }) => {
    await page.goto('/fr/contact');
    await page.getByLabel('Nom', { exact: true }).fill('Awa Diop');
    await page
      .getByLabel('E-mail', { exact: true })
      .fill(`e2e_a11y_contact_${Date.now()}@democracytogether.test`);
    await page.getByLabel('Sujet', { exact: true }).fill('Accessibilité');
    await page
      .getByLabel('Message', { exact: true })
      .fill('Un message de test pour vérifier l’annonce de la confirmation.');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();

    const statut = page
      .getByRole('status')
      .filter({ hasText: 'Message envoyé' });
    await expect(statut).toBeVisible({ timeout: 15_000 });
    // The form (and its button, which had focus) is gone: without
    // moving the focus, it fell back to <body> (RGAA 7.5 fix of 27/09).
    await expect(statut).toBeFocused();
  });

  test('lettre d’information : adresse invalide décrite, inscription confirmée', async ({
    page,
  }) => {
    await page.goto('/fr/newsletter');
    const champ = page.getByLabel('Votre adresse e-mail').first();
    await champ.fill('pas-une-adresse');
    await page.getByRole('button', { name: "S'inscrire" }).first().click();
    await expectFieldError(
      page,
      champ,
      'Veuillez saisir une adresse e-mail valide.',
    );

    await champ.fill(`e2e_a11y_nl_${Date.now()}@democracytogether.test`);
    await page.getByRole('button', { name: "S'inscrire" }).first().click();
    const statut = page.getByRole('status').filter({
      // Double opt-in ("diffusion" workstream): success announces the confirmation
      // email, no longer an immediate subscription.
      hasText: 'Merci ! Un e-mail de confirmation vient de vous être envoyé',
    });
    await expect(statut).toBeVisible({ timeout: 15_000 });
    await expect(statut).toBeFocused();
  });

  test('palette de recherche : le nombre de résultats est annoncé', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    await page.getByRole('button', { name: 'Recherche' }).click();
    const dialogue = page.getByRole('dialog', {
      name: 'Rechercher sur le site',
    });
    await dialogue.getByRole('combobox').fill('democratie');
    await expect(
      dialogue.getByRole('status').filter({ hasText: /\d+ résultats?/ }),
    ).toBeAttached({ timeout: 15_000 });

    await dialogue.getByRole('combobox').fill('zzzxqkw');
    await expect(
      dialogue.getByRole('status').filter({ hasText: 'Aucun résultat' }),
    ).toBeAttached({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Accessible names of key controls (RGAA 7.1, 11.9, 6.1)
// ---------------------------------------------------------------------------

test.describe('arbre d’accessibilité', () => {
  test('en-tête : chaque contrôle a un nom, la langue affichée est dans le nom', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    await expect(page.getByRole('banner')).toMatchAriaSnapshot(`
      - banner:
        - link "Democracy Together — accueil"
        - navigation:
          - link "À propos"
          - link "Membres"
          - link "Actualités"
          - link "Analyses"
          - link "Baromètre"
          - link "Événements"
          - link "Jeunes"
        - button "Recherche"
        - button "Langue et affichage FR"
    `);
    // The current page is indicated by something other than color.
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'À propos' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('lien d’évitement, pied de page : noms et repères', async ({ page }) => {
    await page.goto('/fr');
    await expect(
      page.getByRole('link', { name: 'Aller au contenu' }),
    ).toHaveAttribute('href', '#contenu');
    await expect(page.getByRole('main')).toHaveAttribute('id', 'contenu');
    const pied = page.getByRole('contentinfo');
    for (const nom of ['Le réseau', 'Analyses', "S'engager"]) {
      await expect(pied.getByRole('navigation', { name: nom })).toBeVisible();
    }
  });

  // On desktop, the theme is set in the header's "Langue et affichage"
  // menu (28/09): the chosen state is exposed through `aria-checked`.
  test('apparence : le choix clair / sombre est exposé (aria-checked)', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    const bandeau = page.getByRole('banner');
    await bandeau.getByRole('button', { name: /Langue et affichage/ }).click();
    const sombre = page
      .getByRole('menu', { name: 'Langue et affichage' })
      .getByRole('menuitemradio', { name: 'Sombre' });
    await expect(sombre).toHaveAttribute('aria-checked', 'false');
    await sombre.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // The menu closed and focus went back to the trigger.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(
      bandeau.getByRole('button', { name: /Langue et affichage/ }),
    ).toBeFocused();
    await bandeau.getByRole('button', { name: /Langue et affichage/ }).click();
    await expect(
      page.getByRole('menuitemradio', { name: 'Sombre' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('bascule de thème du pied de page : son état est exposé (aria-pressed)', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');
    const bascule = page
      .getByRole('contentinfo')
      .getByRole('button', { name: 'Changer de thème' });
    const avant = await bascule.getAttribute('aria-pressed');
    await bascule.click();
    await expect(bascule).not.toHaveAttribute('aria-pressed', avant ?? '');
  });

  test('connexion : champs et boutons nommés', async ({ page }) => {
    await page.goto('/fr/connexion');
    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - heading "Se connecter" [level=1]
      - textbox "E-mail"
      - textbox "Mot de passe"
      - button "Afficher le mot de passe"
      - link "Mot de passe oublié ?"
      - button "Se connecter"
    `);
  });

  test('déclaration d’accessibilité : état, taux et listes structurées', async ({
    page,
  }) => {
    await page.goto('/fr/accessibilite');
    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { name: 'État de conformité', level: 2 }),
    ).toBeVisible();
    await expect(main).toContainText('partiellement conforme');
    await expect(main).toContainText('72,6 %');
    // Non-conformities, content not evaluated, contact, remedies: LISTS.
    expect(await main.getByRole('list').count()).toBeGreaterThanOrEqual(4);
  });

  test('globe : un bouton nommé arrête la rotation (RGAA 13.8)', async ({
    page,
  }) => {
    await page.goto('/fr/barometre');
    const bouton = page.getByRole('button', {
      name: /(Mettre en pause|Lancer) la rotation du globe/,
    });
    await expect(bouton).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// 3. Language and direction of content (RGAA 8.3, 8.7, 8.10)
// ---------------------------------------------------------------------------

test.describe('langue des pages et des blocs', () => {
  test('arabe : langue et sens déclarés dans le HTML servi', async ({
    page,
  }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('link', { name: 'الانتقال إلى المحتوى' }),
    ).toBeAttached();
  });

  test('arabe : les descriptions françaises de l’annuaire portent lang="fr"', async ({
    page,
  }) => {
    await page.goto('/ar/le-reseau');
    const description = page
      .getByRole('main')
      .locator('p[lang="fr"][dir="ltr"]')
      .first();
    await expect(description).toBeVisible();
  });

  test('arabe : les titres de la bibliothèque portent leur langue', async ({
    page,
  }) => {
    await page.goto('/ar/bibliotheque');
    await expect(
      page.getByRole('main').locator('h3[lang]').first(),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Signed-in screens: page titles and live regions (RGAA 8.6, 7.5)
// ---------------------------------------------------------------------------

test.describe('espace connecté', () => {
  test.use({ storageState: SESSIONS.a11yAnnonces.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.a11yAnnonces.state });
  });

  test('espace membre : titre de page propre', async ({ page }) => {
    await page.goto('/fr/espace-membre');
    await expect(page).toHaveTitle('Espace membre · Democracy Together');
  });

  test('back-office : titre par écran, régions live montées à vide', async ({
    page,
  }) => {
    await page.goto('/fr/admin/utilisateurs');
    await expect(
      page.getByRole('heading', { name: 'Utilisateurs', level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle(
      'Utilisateurs · Administration · Democracy Together',
    );
    // Action feedback regions must exist BEFORE their text in order to be read
    // (see components/admin/action-feedback.tsx).
    await expect(page.locator('[role="status"]').first()).toBeAttached();
    await expect(page.locator('[role="alert"]').first()).toBeAttached();
    // Table with a caption (RGAA 5.4).
    await expect(
      page.getByRole('table', { name: 'Utilisateurs' }),
    ).toBeVisible();
  });
});
