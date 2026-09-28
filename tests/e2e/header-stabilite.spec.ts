import { test, expect, type BrowserContext } from '@playwright/test';
import { SESSIONS } from './_sessions';
import { declencheurLangue } from './_langue';

// F-13 — THE HEADER MUST NOT SHIFT WHEN AUTHENTICATION RESOLVES.
//
// Root cause of the finding: `JoinButton` rendered `null` while Convex
// responded, then inserted 94 px into a right-anchored cluster
// (`ml-auto`, site-header.tsx:41). Everything before it — language toggle,
// search button — jumped 104 px TO THE LEFT, after the first
// render. A tap aimed at "EN" went to a position the button had just
// left: it landed on the container, with no feedback at all. Measured, the
// actual click target was a `div`, never the button.
//
// WHY THIS TEST SHAPE. Comparing "before" and "after" on the same
// page would race with hydration: on a fast machine the state is
// already resolved when `goto` returns, and the test would pass vacuously without
// checking anything. So we compare two DETERMINISTIC states — the layout served
// by the server (JavaScript disabled) and the settled layout — which is
// exactly the invariant that matters, and depends neither on the machine's
// speed nor on load.
//
// THE MEASUREMENT POINT IS THE LANGUAGE SELECTOR TRIGGER, since it
// became a menu: the languages themselves are no longer in the document while
// it is closed, and this test precisely measures a document NEVER opened —
// one of whose two renders has JavaScript disabled. The trigger, for its part, is
// served by the server, and it occupies the same place in the right-anchored
// cluster: the same invariant is upheld.
async function abscisseBascule(ctx: BrowserContext, url: string) {
  const page = await ctx.newPage();
  await page.goto(url);
  const boite = await declencheurLangue(page).boundingBox();
  return { page, x: boite?.x ?? null };
}

test("l'en-tête ne se décale pas entre le rendu serveur et l'état établi (F-13)", async ({
  browser,
  baseURL,
}) => {
  const url = `${baseURL}/fr`;

  const sansJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: './tests/e2e/cookie-consent-state.json',
  });
  const servi = await abscisseBascule(sansJs, url);

  const avecJs = await browser.newContext({
    storageState: './tests/e2e/cookie-consent-state.json',
  });
  const etabli = await abscisseBascule(avecJs, url);
  // "Connexion" only appears once the auth state is resolved:
  // precisely the moment the header used to take its 104 px.
  await expect(
    etabli.page
      .getByRole('banner')
      .getByRole('link', { name: /connexion|sign in/i }),
  ).toBeVisible();
  const xEtabli = (await declencheurLangue(etabli.page).boundingBox())?.x;

  expect(servi.x, 'la bascule doit exister dans le HTML servi').not.toBeNull();
  expect(
    xEtabli,
    "la bascule doit exister une fois l'état établi",
  ).not.toBeUndefined();

  const ecart = Math.abs((xEtabli as number) - (servi.x as number));
  // The measured residual is 2 px — the `AuthButton` placeholder (64 px) versus
  // the "Connexion" link (66 px). The defect was 104 px: the margin
  // tells the two apart unambiguously.
  expect(
    ecart,
    `la bascule de langue s'est déplacée de ${ecart} px entre le rendu servi et l'état établi`,
  ).toBeLessThanOrEqual(8);

  await sansJs.close();
  await avecJs.close();
});

// THE SIGNED-IN CASE, the second half of the shift. For a signed-in visitor,
// `NotificationBell` appeared afterwards (36 px) and `AuthButton` went
// from a 64 px placeholder to "Espace membre · Déconnexion", much wider:
// the header rearranged itself as for an anonymous visitor, but more so.
// Since `site-header.tsx` reads the auth state during the SERVER render,
// the served HTML already carries the final variant.
//
// This case is only measurable HERE: the audit environment has no
// Convex deployment, hence no session. CI, for its part, has one per file.
//
// NON-VACUITY IS ASSERTED. If the session were lost, this test would compare
// the ANONYMOUS layout twice and pass without checking anything — the exact
// defect this audit criticizes elsewhere. So we require the served HTML to carry
// the signed-in state marker BEFORE comparing anything.
test("l'en-tête ne se décale pas non plus pour un visiteur connecté (F-13)", async ({
  browser,
  baseURL,
}) => {
  const url = `${baseURL}/fr`;
  const etat = SESSIONS.enTete.state;

  const sansJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: etat,
  });
  const servi = await abscisseBascule(sansJs, url);
  // Without JavaScript, only the SERVER render speaks: "Déconnexion" only
  // appears there if the server did recognize the session.
  await expect(
    servi.page
      .getByRole('banner')
      .getByRole('button', { name: /déconnexion|sign out/i }),
    'la session doit être reconnue au rendu serveur, sinon ce test est vacant',
  ).toBeVisible();

  const avecJs = await browser.newContext({ storageState: etat });
  const etabli = await abscisseBascule(avecJs, url);
  await expect(
    etabli.page
      .getByRole('banner')
      .getByRole('link', { name: /espace membre|member space/i }),
  ).toBeVisible();
  const xEtabli = (await declencheurLangue(etabli.page).boundingBox())?.x;

  const ecart = Math.abs((xEtabli as number) - (servi.x as number));
  expect(
    ecart,
    `la bascule de langue s'est déplacée de ${ecart} px entre le rendu servi et l'état établi (visiteur connecté)`,
  ).toBeLessThanOrEqual(8);

  await sansJs.close();
  await avecJs.close();
});
