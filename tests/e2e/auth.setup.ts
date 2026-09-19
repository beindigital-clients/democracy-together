import { existsSync, mkdirSync } from 'node:fs';
import { test as setup, expect, type Browser } from '@playwright/test';
import { provisionUser, provisionPassword } from './_helpers';
import { SESSIONS, SESSION_PASSWORD, type SessionRole } from './_sessions';

// Projet `setup` : ouvre une session par rôle et l'enregistre (cf. _sessions.ts).
// Il s'exécute avant les autres projets, qui en dépendent.
//
// La connexion passe par l'ÉCRAN RÉEL : si la page de connexion se casse, ce
// sont ces quatre cas qui tombent, avant tout le reste — et le message est
// clair, au lieu de quinze specs qui échouent chacune à leur manière.
//
// RÉUTILISATION D'UN RUN À L'AUTRE. Un fichier de session déjà sur disque est
// repris tel quel : en local, relancer une spec ne repaie plus les quatre
// connexions (~30 s), et l'itération redevient supportable. En CI la question
// ne se pose pas — `tests/e2e/.auth/` est ignoré par git, donc absent d'un
// checkout neuf : le chemin complet s'exécute, à l'identique.

const AUTH_DIR = 'tests/e2e/.auth';

// Validité d'un état sauvegardé : on ne se fie ni à la date du fichier ni à
// l'expiration déclarée des cookies (le jeton se rafraîchit, le serveur peut
// avoir été redéployé entre-temps, la préversion peut avoir été purgée). Seule
// la réponse de l'application fait foi — on demande une page réservée aux
// connectés et on regarde où l'on atterrit.
async function sessionIsUsable(
  browser: Browser,
  state: string,
  baseURL: string | undefined,
): Promise<boolean> {
  if (!existsSync(state)) return false;
  if (process.env.E2E_FRESH_LOGIN === '1') return false;

  const context = await browser.newContext({ storageState: state, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/fr/espace-membre');
    // Session morte = redirection vers la connexion. On le constate tout de
    // suite plutôt que d'attendre l'expiration d'un `toBeVisible`.
    if (/\/connexion/.test(page.url())) return false;
    await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible(
      {
        timeout: 10_000,
      },
    );
    return true;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

for (const role of Object.keys(SESSIONS) as SessionRole[]) {
  setup(`session partagée : ${role}`, async ({ browser, page }) => {
    const { email, state } = SESSIONS[role];
    const baseURL = setup.info().project.use.baseURL;

    if (await sessionIsUsable(browser, state, baseURL)) {
      setup.info().annotations.push({
        type: 'session',
        description: `réutilisée depuis ${state}`,
      });
      return;
    }

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

    mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: state });
  });
}
