import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { provisionUser } from './_helpers';

// TEMPORAIRE (issue #66) — sonde NAVIGATEUR, à retirer avec le correctif.
//
// La sonde serveur (scripts/diagnostic-66.mjs) a établi que la chaîne Convex
// est saine : la CLI écrit et relit le même déploiement, et `auth:signIn`
// appelé par la MÊME url que le navigateur rend `{started:true}` en générant
// le code. Ce qui échoue est donc côté navigateur, et seulement pour l'auth —
// les autres écritures Convex passées par le navigateur (inscription à un
// événement, newsletter) passent.
//
// Cette sonde capte ce que le navigateur voit : messages de console, erreurs
// non rattrapées, requêtes en échec, et réponses de `/api/auth` (la route que
// `convexAuthNextjsMiddleware` sert, et par laquelle passe l'échange de jeton).
//
// Le rapport part dans un FICHIER, affiché ensuite par le pas d'atelier : la
// sortie standard d'une spec ne traverse pas le reporter `github`.

test('SONDE #66 navigateur : demande de code sur /fr/connexion-otp', async ({
  page,
}) => {
  const lines: string[] = [];
  const email = `e2e_sonde_nav_${Date.now()}@democracytogether.test`;

  page.on('console', (m) => lines.push(`CONSOLE[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => lines.push(`PAGEERROR ${e.message}`));
  page.on('requestfailed', (r) =>
    lines.push(`REQFAILED ${r.url()} — ${r.failure()?.errorText ?? '?'}`),
  );
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/auth') || u.includes('convex')) {
      lines.push(`RESPONSE ${r.status()} ${u}`);
    }
  });

  try {
    await provisionUser(email);
    lines.push(`compte provisionné : ${email}`);

    await page.goto('/fr/connexion-otp');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Recevoir un code' }).click();

    // On laisse le temps à l'échange d'aboutir (ou d'échouer).
    await page.waitForTimeout(8000);

    const heading = await page
      .getByRole('heading', { name: 'Saisissez le code' })
      .count();
    lines.push(`écran « Saisissez le code » présent : ${heading > 0}`);
    const bodyText = (await page.locator('body').innerText()).slice(0, 600);
    lines.push(`--- texte de la page ---\n${bodyText}`);
  } catch (e) {
    lines.push(`EXCEPTION ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    writeFileSync('diagnostic-66-navigateur.log', lines.join('\n'), 'utf8');
  }
});
