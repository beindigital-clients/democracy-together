import { defineConfig, devices } from '@playwright/test';

// Config d'AUDIT (lecture seule, hors arborescence du projet).
// Trois écarts assumés avec playwright.config.ts, tous documentés :
//  1. `executablePath` explicite : l'environnement fournit Chromium build 1194,
//     le Playwright épinglé (1.61.1) en réclame 1228 et refuse de démarrer.
//  2. aucune dépendance au projet `setup` : aucun déploiement Convex n'est
//     disponible ici, donc aucune session ne peut être ouverte.
//  3. le consentement aux cookies est CONSTRUIT pour l'origine réellement
//     servie, au lieu d'être lu dans `tests/e2e/cookie-consent-state.json`.
//     Ce fichier fige l'origine `http://localhost:3000` ; or le localStorage
//     est cloisonné par origine, donc dès qu'`AUDIT_BASE_URL` désigne un autre
//     port le consentement ne s'applique plus SANS RIEN SIGNALER : le bandeau
//     réapparaît, `fixed inset-x-0 bottom-0 z-[80]`, et il intercepte les clics
//     sur le pied de page en plus de s'ajouter à chaque scan d'accessibilité.
//     Mesuré : un clic sur le bouton de thème échouait à chaque essai, avec
//     « <div role="region" aria-label="Gestion des cookies"> intercepts
//     pointer events » — un défaut d'instrument pris un moment pour un
//     résultat.
const CHROME = '/opt/pw-browsers/chromium';
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const CONSENTI = {
  cookies: [],
  origins: [
    {
      origin: BASE,
      localStorage: [{ name: 'dt-cookie-consent', value: 'essential' }],
    },
  ],
};

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
    baseURL: BASE,
    trace: 'retain-on-failure',
    launchOptions: { executablePath: CHROME },
    storageState: CONSENTI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
