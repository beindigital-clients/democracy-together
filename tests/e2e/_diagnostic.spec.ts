import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { provisionUser } from './_helpers';

// TEMPORAIRE (issue #66) — mesure, à retirer avec le correctif.
//
// Les deux sondes précédentes ont établi que la chaîne fonctionne de bout en
// bout en CI : la CLI écrit et relit le même déploiement, `auth:signIn` rend
// `{started:true}`, `/api/auth` répond 200, et l'écran « Saisissez le code »
// finit par s'afficher. Ce qui manquait aux 15 specs n'était donc pas un
// chemin, c'était du TEMPS — elles s'en remettent au délai par défaut de
// Playwright (5 s), et toutes les traces portent `Timeout: 5000ms`.
//
// Reste à connaître la durée réelle, pour choisir un plafond sur une mesure et
// non sur une intuition. Trois demandes de code d'affilée : la première paie le
// démarrage à froid de la préversion, les suivantes non.

test('MESURE #66 : durée de la demande de code (3 fois)', async ({ page }) => {
  const lines: string[] = [];
  try {
    for (let i = 1; i <= 3; i++) {
      const email = `e2e_mesure_${i}_${Date.now()}@democracytogether.test`;
      const t0 = Date.now();
      await provisionUser(email);
      const tProvision = Date.now() - t0;

      await page.goto('/fr/connexion-otp');
      await page.getByLabel('E-mail').fill(email);
      const t1 = Date.now();
      await page.getByRole('button', { name: 'Recevoir un code' }).click();
      await page
        .getByRole('heading', { name: 'Saisissez le code' })
        .waitFor({ state: 'visible', timeout: 40_000 });
      const tCode = Date.now() - t1;

      lines.push(
        `tour ${i} : provisionUser (CLI) ${tProvision} ms · demande de code ${tCode} ms`,
      );
    }
  } catch (e) {
    lines.push(`EXCEPTION ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    writeFileSync('diagnostic-66-navigateur.log', lines.join('\n'), 'utf8');
  }
});
