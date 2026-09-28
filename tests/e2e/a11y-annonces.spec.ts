import { test, expect } from '@playwright/test';
import { expectFieldError } from './_fields';
import { SESSIONS } from './_sessions';

// F-08 — CE QU'ENTEND UNE PERSONNE QUI UTILISE UN LECTEUR D'ÉCRAN (audit RGAA
// du 27/09, critères 7.1, 7.5, 8.6, 8.7, 11.1, 11.10 et 11.9).
//
// Aucun lecteur d'écran ne tourne dans la CI. Ce que ces tests tiennent, c'est
// ce que le lecteur d'écran LIT : l'arbre d'accessibilité du navigateur (noms,
// rôles, états — `ariaSnapshot`), les régions live (`role=status` /
// `role=alert`), le rattachement des erreurs aux champs, la langue des blocs.
// La restitution vocale elle-même se vérifie à la main, selon le protocole de
// `docs/rgaa/protocole-lecteurs-ecran.md`.

test.use({ locale: 'fr-FR' });

// ---------------------------------------------------------------------------
// 1. Messages d'erreur et de succès (RGAA 7.5, 11.10)
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
    // Filtré : Next pose sa propre région `alert` vide, l'annonceur de route.
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
      // Ce que le lecteur d'écran lit en arrivant sur le champ : son nom,
      // « invalide », et la description — le message d'erreur.
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
    // Le formulaire (et son bouton, qui avait le focus) a disparu : sans
    // reprise du focus, il retombait sur <body> (correctif RGAA 7.5 du 27/09).
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
      // Double opt-in (chantier diffusion) : le succès annonce le courriel
      // de confirmation, plus une inscription immédiate.
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
// 2. Noms accessibles des contrôles clés (RGAA 7.1, 11.9, 6.1)
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
    // La page courante est signalée autrement que par la couleur.
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

  // Sur desktop, le thème se règle dans le menu « Langue et affichage » de
  // l'en-tête (28/09) : l'état choisi est exposé par `aria-checked`.
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
    // Le menu s'est refermé et le focus est revenu au déclencheur.
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
    // Non-conformités, contenus non évalués, contact, recours : des LISTES.
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
// 3. Langue et sens des contenus (RGAA 8.3, 8.7, 8.10)
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
// 4. Écrans connectés : titres de page et régions live (RGAA 8.6, 7.5)
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
    // Les retours d'action doivent exister AVANT leur texte pour être lus
    // (cf. components/admin/action-feedback.tsx).
    await expect(page.locator('[role="status"]').first()).toBeAttached();
    await expect(page.locator('[role="alert"]').first()).toBeAttached();
    // Tableau titré (RGAA 5.4).
    await expect(
      page.getByRole('table', { name: 'Utilisateurs' }),
    ).toBeVisible();
  });
});
