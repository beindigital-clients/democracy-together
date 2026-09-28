import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Loads .env.local for the test process (NEXT_PUBLIC_CONVEX_URL is used to read
// the dev OTP codes via the Convex client).
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local missing: we carry on */
}

// Escape hatch for an environment whose Chromium does NOT match the
// build pinned by Playwright (blind spot 2 of the audit: build 1194 present,
// 1228 required — the browser refuses to start, and no project in this
// file can run). The workaround existed, but only in the audit
// config, hard-coded: it therefore helped no one run
// `mobile-chromium` or `dev-browser` outside CI.
//
//   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e
//
// When unset — the CI case, which installs the expected build — the variable
// changes nothing: `launchOptions` stays absent.
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = CHROMIUM ? { executablePath: CHROMIUM } : undefined;

// DEDICATED PORT — `E2E_PORT`, 3000 by default.
//
// WHY. The port was hard-coded in three places, and `reuseExistingServer`
// is active outside CI: any server already listening on 3000 is reused as
// is. On a machine where several worktrees (or several agents)
// work in parallel, this ranges from an annoyance — you wait for someone else's
// run — to a false verdict: the run queries the server of ANOTHER PROJECT
// and every spec fails on a 404 that says nothing about the code. It has happened.
//
// One port per worktree separates the runs without changing anything in CI,
// which does not set the variable and stays on 3000.
//
//   E2E_PORT=3217 pnpm test:e2e
//
// `next start` reads `PORT`: the server command sets it, and both the wait URL
// and the `baseURL` derive from it.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const ORIGINE = `http://localhost:${PORT}`;

// COOKIE CONSENT IS BOUND TO AN ORIGIN. `storageState` associates its
// `localStorage` with `http://localhost:3000`: served on another port, the
// F-09 banner reappears and intercepts clicks from specs that do not target
// it. We therefore derive the state for the origin actually used, in
// `tests/e2e/.auth/` (ignored by git). On 3000, the committed file is used as
// is — no file produced, no change in behavior.
const CONSENTEMENT = './tests/e2e/cookie-consent-state.json';
function etatDeConsentement(): string {
  if (PORT === 3000) return CONSENTEMENT;
  const etat = JSON.parse(readFileSync(CONSENTEMENT, 'utf8')) as {
    origins: { origin: string }[];
  };
  etat.origins = etat.origins.map((o) => ({ ...o, origin: ORIGINE }));
  mkdirSync('tests/e2e/.auth', { recursive: true });
  const chemin = `./tests/e2e/.auth/cookie-consent-${PORT}.json`;
  writeFileSync(chemin, `${JSON.stringify(etat, null, 2)}\n`);
  return chemin;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 retry: absorbs the flakes of `next dev` on-demand compilation
  // (first request on a route = compile, the field may appear late).
  retries: 1,
  timeout: 45_000,
  // In CI, the `github` reporter sets annotations on the PR but produces
  // NO file: the workflow's "Publier le rapport" step was therefore looking for a
  // nonexistent `playwright-report/` and reported "No files were found" on
  // every run. Practical consequence: no trace, no page snapshot
  // to examine, and every diagnosis cost a full run
  // in the dark (issue #66). We add the HTML report, which embeds the traces
  // already captured by `trace: 'on-first-retry'`.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: ORIGINE,
    trace: 'on-first-retry',
    // Cookie consent pre-set (a "returning" user) so that the
    // F-09 banner (fixed, page bottom) does not intercept clicks from the other
    // specs. The dedicated `legal.spec` test starts from a blank state to see it.
    // The file is named after what it contains (issue #44): `storage-state`
    // is the Playwright convention for an AUTHENTICATION state, and that name
    // invited someone to commit a real session into it one day. Session states,
    // on the other hand, are produced by the `setup` project in `tests/e2e/.auth/` (ignored).
    storageState: etatDeConsentement(),
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [
    {
      // Opens the shared sessions and saves them to disk, once
      // for the whole run (cf. tests/e2e/_sessions.ts). The projects
      // below depend on it: Playwright runs it first, and stops there
      // if it fails — a single clear message rather than fifteen specs that
      // each fail in their own way.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      // The specs in `tests/e2e/mobile/` belong to the mobile project:
      // replaying them here would run them on a desktop viewport, without touch —
      // exactly what they check. The `setup` project has its own
      // file, which is not a spec.
      // `dev-browser.spec.ts` has its OWN project (below): it sets
      // viewport and theme itself, and replaying it here would capture it once
      // more, in light desktop only.
      testIgnore: [
        '**/mobile/**',
        '**/auth.setup.ts',
        '**/dev-browser.spec.ts',
      ],
    },
    {
      // Mobile is a structuring requirement of the brief (primary usage
      // expected in Africa): a dedicated project, with a real phone viewport
      // and touch enabled (`hasTouch`), so that `locator.tap()` and
      // `pointerType: 'touch'` gestures are genuinely exercised. Chromium
      // only: `isMobile` is not emulated by Firefox/WebKit.
      name: 'mobile-chromium',
      testDir: './tests/e2e/mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      // "dev-browser" level (issue #50): screenshots of the actual rendering, to
      // LOOK AT. A separate project because it is not a gate — it
      // decides nothing, it shows — and because it walks its own matrix
      // (light/dark × desktop/mobile): no emulation is set here,
      // the spec sets it per block.
      //
      // It depends on `setup` like the others: the SIGNED-IN state is one of the
      // required combinations, and a screenshot silently skipped is
      // exactly what issue #50 criticizes in the previous convention.
      //
      // It is NOT run by `pnpm test:e2e`, which names its projects: 40
      // full-page screenshots have no place in a PR's verification
      // path. `pnpm test:dev-browser` requests it.
      name: 'dev-browser',
      testMatch: /dev-browser\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Prod build: all routes are pre-compiled, so no on-demand compilation
    // flakes when several workers hit in parallel (and
    // we test the real artifact). Slower startup, deterministic execution.
    // The server output is relayed into the test log AND kept in
    // `server.log`: relayed, it drowns among thousands of build
    // lines; in a file, the workflow step can print its tail, at a
    // predictable place. That is what was missing to diagnose a page that
    // responds "Internal Server Error" (issue #66).
    command: `pnpm build && PORT=${PORT} pnpm start 2>&1 | tee server.log`,
    stdout: 'pipe',
    stderr: 'pipe',
    url: `${ORIGINE}/fr`,
    reuseExistingServer: !process.env.CI,
    // The GitHub runner is slower than a dev machine, and this startup includes
    // a full prod build: 3 min is rarely enough there. A timeout here
    // says nothing about the code, only about the machine -> wider margin in CI.
    timeout: process.env.CI ? 420_000 : 180_000,
  },
});
