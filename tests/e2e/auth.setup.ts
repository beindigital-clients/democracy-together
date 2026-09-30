import { existsSync, mkdirSync } from 'node:fs';
import { test as setup, expect, type Browser } from '@playwright/test';
import { menuCompte, provisionUser, provisionPassword } from './_helpers';
import { SESSIONS, SESSION_PASSWORD, type SessionKey } from './_sessions';

// `setup` project: opens one session per role and saves it (see _sessions.ts).
// It runs before the other projects, which depend on it.
//
// Sign-in goes through the REAL SCREEN: if the sign-in page breaks, it is
// these four cases that fail, before everything else — and the message is
// clear, instead of fifteen specs each failing in their own way.
//
// REUSE FROM ONE RUN TO THE NEXT. A session file already on disk is
// reused as is: locally, rerunning a spec no longer pays for the four
// sign-ins (~30 s), and iterating becomes bearable again. In CI the question
// does not arise — `tests/e2e/.auth/` is ignored by git, hence absent from a
// fresh checkout: the full path runs, identically.

const AUTH_DIR = 'tests/e2e/.auth';

// Validity of a saved state: we trust neither the file date nor the
// declared expiry of the cookies (the token refreshes, the server may
// have been redeployed in the meantime, the preview may have been purged). Only
// the application's response is authoritative — we request a page reserved for
// signed-in users and look at where we land.
//
// AND WE WAIT FOR THE REFRESH (campaign of 27/09). The Convex client
// exchanges the refresh token on EVERY page load
// (`POST /api/auth`, `refreshToken`), and Convex Auth only accepts an already
// exchanged token as long as it is the PARENT of the active token; beyond that, the
// whole session is invalidated (see _sessions.ts). A file reused from a previous
// run therefore carries a possibly stale token, while the page, rendered
// from the still-valid JWT, shows the account menu: the check said
// "usable", and the first spec to use it woke up on
// `/connexion` (admin-ecrans, moderator session — measured). So we read the
// exchange's response: null, the state is dead; otherwise we SAVE the state AGAIN
// with the freshly issued token, which is the one the specs will present.
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
    const refresh = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/auth') &&
        (r.request().postData() ?? '').includes('refreshToken'),
      { timeout: 15_000 },
    );
    await page.goto('/fr/espace-membre');
    // Dead session = redirect to sign-in. We detect it right
    // away rather than waiting for a `toBeVisible` to time out.
    if (/\/connexion/.test(page.url())) return false;
    await expect(menuCompte(page)).toBeVisible({ timeout: 10_000 });
    const tokens = ((await (await refresh).json()) as { tokens: unknown })
      .tokens;
    if (tokens === null) return false;
    await context.storageState({ path: state });
    return true;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

// The key names the session, not necessarily a role: a session dedicated to a
// spec file carries the role declared in its entry (see _sessions.ts).
for (const key of Object.keys(SESSIONS) as SessionKey[]) {
  setup(`session partagée : ${key}`, async ({ browser, page }) => {
    const { email, state, role } = SESSIONS[key];
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
    // The URL switches as soon as the client-side redirect happens: we wait for an element that
    // exists ONLY when signed in, otherwise the saved state might contain nothing.
    await expect(menuCompte(page)).toBeVisible({ timeout: 15_000 });

    mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: state });
  });
}
