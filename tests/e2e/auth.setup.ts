import { mkdirSync } from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { provisionUser, provisionPassword } from './_helpers';
import { SESSIONS, SESSION_PASSWORD, type SessionRole } from './_sessions';

// Projet `setup` : ouvre une session par rôle et l'enregistre (cf. _sessions.ts).
// Il s'exécute avant les autres projets, qui en dépendent.
//
// La connexion passe par l'ÉCRAN RÉEL : si la page de connexion se casse, ce
// sont ces quatre cas qui tombent, avant tout le reste — et le message est
// clair, au lieu de quinze specs qui échouent chacune à leur manière.

for (const role of Object.keys(SESSIONS) as SessionRole[]) {
  setup(`session partagée : ${role}`, async ({ page }) => {
    const { email, state } = SESSIONS[role];

    await provisionUser(email, role);
    await provisionPassword(email, SESSION_PASSWORD);

    await page.goto('/fr/connexion');
    await page.getByLabel('E-mail').fill(email);
    await page
      .getByLabel('Mot de passe', { exact: true })
      .fill(SESSION_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/espace-membre$/);
    // L'URL bascule dès la redirection côté client : on attend un élément qui
    // n'existe QUE connecté, sinon l'état sauvegardé pourrait ne rien contenir.
    await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible(
      { timeout: 15_000 },
    );

    mkdirSync('tests/e2e/.auth', { recursive: true });
    await page.context().storageState({ path: state });
  });
}
