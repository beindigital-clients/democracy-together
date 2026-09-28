import { defineConfig, devices } from '@playwright/test';

// AUDIT config (read-only, outside the project tree).
// Three deliberate deviations from playwright.config.ts, all documented:
//  1. explicit `executablePath`: the environment provides Chromium build 1194,
//     the pinned Playwright (1.61.1) asks for 1228 and refuses to start.
//  2. no dependency on the `setup` project: no Convex deployment is
//     available here, so no session can be opened.
//  3. cookie consent is BUILT for the origin actually
//     served, instead of being read from `tests/e2e/cookie-consent-state.json`.
//     That file hard-codes the origin `http://localhost:3000`; but localStorage
//     is partitioned by origin, so as soon as `AUDIT_BASE_URL` points to another
//     port the consent no longer applies, WITHOUT ANY SIGNAL: the banner
//     reappears, `fixed inset-x-0 bottom-0 z-[80]`, and it intercepts clicks
//     on the footer on top of being added to every accessibility scan.
//     Measured: a click on the theme button failed on every attempt, with
//     "<div role="region" aria-label="Gestion des cookies"> intercepts
//     pointer events" — an instrument defect briefly mistaken for a
//     result.
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
