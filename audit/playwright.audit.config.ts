import { defineConfig, devices } from '@playwright/test';

// Config d'AUDIT (lecture seule, hors arborescence du projet).
// Deux écarts assumés avec playwright.config.ts, tous deux documentés :
//  1. `executablePath` explicite : l'environnement fournit Chromium build 1194,
//     le Playwright épinglé (1.61.1) en réclame 1228 et refuse de démarrer.
//  2. aucune dépendance au projet `setup` : aucun déploiement Convex n'est
//     disponible ici, donc aucune session ne peut être ouverte.
const CHROME = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          '/home/user/democracy-together/audit/logs/browser-report.json',
      },
    ],
  ],
  use: {
    baseURL: process.env.AUDIT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: CHROME },
    storageState:
      '/home/user/democracy-together/tests/e2e/cookie-consent-state.json',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
