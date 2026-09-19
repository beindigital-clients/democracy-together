import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Charge .env.local pour le process de test (NEXT_PUBLIC_CONVEX_URL sert à lire
// les codes OTP de dev via le client Convex).
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local absent : on continue */
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 retry : absorbe les flakes de compilation à la demande de `next dev`
  // (première requête sur une route = compile, le champ peut apparaître tard).
  retries: 1,
  timeout: 45_000,
  // En CI, le reporter `github` pose les annotations sur la PR mais ne produit
  // AUCUN fichier : le pas « Publier le rapport » du workflow cherchait donc un
  // `playwright-report/` inexistant et signalait « No files were found » à
  // chaque exécution. Conséquence pratique : aucune trace, aucun instantané de
  // page à examiner, et chaque diagnostic coûtait une exécution complète à
  // l'aveugle (issue #66). On ajoute le rapport HTML, qui embarque les traces
  // déjà captées par `trace: 'on-first-retry'`.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Consentement cookies pré-positionné (utilisateur « déjà venu ») pour que le
    // bandeau F-09 (fixed, bas de page) n'intercepte pas les clics des autres
    // specs. Le test dédié `legal.spec` repart d'un état vierge pour le voir.
    storageState: './tests/e2e/storage-state.json',
  },
  projects: [
    {
      // Ouvre les sessions partagées et les enregistre sur disque, une fois
      // pour toute l'exécution (cf. tests/e2e/_sessions.ts). Les projets
      // ci-dessous en dépendent : Playwright le joue d'abord, et s'arrête là
      // s'il échoue — un seul message clair plutôt que quinze specs qui
      // tombent chacune à sa façon.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      // Les specs de `tests/e2e/mobile/` appartiennent au projet mobile : les
      // rejouer ici les exécuterait sur un viewport desktop, sans tactile —
      // exactement ce qu'elles vérifient. Le projet `setup` a son propre
      // fichier, qui n'est pas une spec.
      testIgnore: ['**/mobile/**', '**/auth.setup.ts'],
    },
    {
      // Le mobile est une exigence structurante du cadrage (premier usage
      // attendu en Afrique) : un projet dédié, avec un vrai viewport téléphone
      // et le tactile actif (`hasTouch`), pour que `locator.tap()` et les
      // gestes `pointerType: 'touch'` soient exercés pour de bon. Chromium
      // seul : `isMobile` n'est pas émulé par Firefox/WebKit.
      name: 'mobile-chromium',
      testDir: './tests/e2e/mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // Build de prod : toutes les routes sont pré-compilées, donc pas de flake de
    // compilation à la demande quand plusieurs workers tapent en parallèle (et
    // on teste l'artefact réel). Démarrage plus lent, exécution déterministe.
    command: 'pnpm build && pnpm start',
    // Sortie du serveur Next RELAYÉE dans le log des tests. Sans cela, une
    // page qui rend « Internal Server Error » n'est qu'un écran blanc côté
    // test : la pile d'appels, elle, reste dans un flux jeté (issue #66).
    stdout: 'pipe',
    stderr: 'pipe',
    url: 'http://localhost:3000/fr',
    reuseExistingServer: !process.env.CI,
    // Le runner GitHub est plus lent qu'un poste de dev, et ce démarrage inclut
    // un build de prod complet : 3 min y suffisent rarement. Un dépassement ici
    // ne dit rien du code, seulement de la machine -> marge plus large en CI.
    timeout: process.env.CI ? 420_000 : 180_000,
  },
});
