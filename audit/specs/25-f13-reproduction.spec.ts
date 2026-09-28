import { test, expect, type Browser } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const N = Number(process.env.F13_N ?? 12);

// F-13 — THE CAUSE, AND ITS PROOF.
//
// The finding withstood five CI campaigns because it could only be observed in
// CI: one failure out of 213 tests, never the same one. This file first
// reproduced it locally in thirty seconds; it now documents ITS CAUSE.
//
// THE CAUSE. `JoinButton` rendered `null` while Convex resolved the
// authentication state, then inserted 94 px into a right-anchored cluster
// (`ml-auto`, site-header.tsx:41). Everything before it — language toggle,
// search button — jumped 104 px TO THE LEFT, after the first
// render. Playwright computes the click coordinates, then dispatches it: under
// throttling, the header reflows in between, and the click goes to a position
// the button has just left.
//
// MEASURED, NOT INFERRED: at the moment of the click, the actual target was
// `div.hidden.items-center.gap-2` — the container — and never the button. The
// button itself did carry its React props: it was hydrated and functional.
// So it was not a hydration defect but a click missing its target.
//
//   throttle  before     after
//   ×1        40/40      12/12
//   ×4         0/40      12/12
//
// WHAT THIS EXPLAINS, and what had remained open:
//
//   • why the FOOTER responded at the same instant — it does not reflow;
//   • why the MOBILE MENU toggle responded from 0 ms — the cluster that
//     moves is `hidden` below 1120 px; measured, the mobile toggle does not
//     move by a single pixel;
//   • why a LOCAL STATE gesture and a NAVIGATION gesture died
//     TOGETHER — they are neighbors in the cluster that moves;
//   • why a SECOND click succeeded — it starts from fresh coordinates,
//     which is exactly what the helpers in `tests/e2e/_panneau.ts` do;
//   • why the window was proportional to the machine's slowness —
//     the later Convex responds, the later the reflow;
//   • why NOTHING appeared in the console — a click on a `div`
//     produces nothing.
//
// WHAT IT MEANS FOR A VISITOR, and this is the real cost: on a
// slow phone, the header rearranges itself under the finger. The first tap on
// "EN" misses, without any feedback. It was never a test
// defect.
//
// THE FIX: `JoinButton` reserves its space while loading
// (`invisible`, which keeps the box), as `AuthButton` already did.
// Measured residual: 2 px — the `AuthButton` placeholder (64 px) versus the
// "Connexion" link (66 px).
//
// NON-REGRESSION GUARD: `tests/e2e/header-stabilite.spec.ts`, run in CI.
// Seen going RED on the previous code (103.9 px) and green after (2.4 px).
//
// WHAT REMAINS: a SIGNED-IN visitor still sees the header move, the
// `AuthButton` placeholder being much narrower than "Espace membre ·
// Déconnexion". Outside the scope of this fix, and not measured here.
//
// LEADS RULED OUT ALONG THE WAY, by measurement and not by reasoning. They
// stay on record: they say what the finding WAS NOT.
//
//   • "the panel is slow" — at ×4 the URL NEVER switched, even after
//     20 seconds;
//   • `useSearchParams()` — hypothesis tested, refuted, fix reverted;
//   • the page weight;
//   • the dispatch delay — header click at 1037 ms (0/6), footer
//     click at 1060 ms (5/5): the same instant, opposite results;
//   • "being server-rendered" — the theme button and the contact form
//     submission are too, and succeed from 0 ms;
//   • React replacing the node — a marker set as a JS property
//     survives the click on both sides;
//   • a hydration error — zero console messages, zero `pageerror`.

// The horizontal offset of the language toggle between the SERVED layout
// (JavaScript disabled) and the SETTLED layout. It was 104 px: the cause.
// Two DETERMINISTIC states, so no race with hydration and no
// sensitivity to load — unlike a threshold on rates.
async function ecartDeMiseEnPage(browser: Browser): Promise<number> {
  async function abscisse(js: boolean): Promise<number> {
    const ctx = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: js,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/fr`);
    if (js) await page.waitForTimeout(4_000);
    const b = await page
      .locator('header button[lang="en"]')
      .first()
      .boundingBox();
    await ctx.close();
    return b?.x ?? NaN;
  }
  return Math.abs((await abscisse(true)) - (await abscisse(false)));
}

async function tauxDeReussite(
  browser: Browser,
  bridage: number,
): Promise<number> {
  const ctx = await browser.newContext({ locale: 'fr-FR' });
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const page = await ctx.newPage();
    if (bridage > 1) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: bridage });
    }
    // Default `goto()`: EXACTLY what the repo's specs do.
    await page.goto(`${BASE}/fr`);
    try {
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'EN' })
        .click({ timeout: 8_000 });
      await page.waitForTimeout(1_200);
      if (/\/en$/.test(page.url())) ok++;
    } catch {
      /* click impossible: counted as a failure */
    }
    await page.close();
  }
  await ctx.close();
  return ok;
}

// ONE PROJECT ONLY: this is a MACHINE measurement, not a viewport one. Replaying it on
// mobile would double it without learning anything — and cost two more minutes.
// NO ASSERTION ON THE RATES, and that is deliberate — same stance as the
// Next limitation measured in 36-404.
//
// The first version asserted the idle case ("must succeed every
// time"). It went red from the first full campaign: the machine was
// loaded by the rest of the suite, so the "idle" case no longer was.
// I was about to add a LOAD-SENSITIVE gate to the repo to fix a
// finding about load-sensitive gates. Measured, not reasoned.
//
// So we print both rates. The day the cause is found, the second
// number goes up and shows in the report — without a red test having had to
// announce it, which this same audit criticizes elsewhere.
// The second part of the finding, and the one that corrected my mistake: it is not
// THE COMPONENT. At the same instant, at the same viewport, on the same page, a
// LOCAL STATE gesture (opening the search palette) and a NAVIGATION gesture
// (switching the language) both fail — then both succeed.
// They die and come back to life together.
test('F-13 — état local et navigation se comportent pareil', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'mesure de machine, un projet');
  test.setTimeout(600_000);

  async function essai(
    attente: number,
    geste: (p: import('@playwright/test').Page) => Promise<void>,
    reussi: (p: import('@playwright/test').Page) => Promise<boolean>,
  ): Promise<boolean> {
    const ctx = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${BASE}/fr`);
    await page.waitForTimeout(attente);
    try {
      await geste(page);
    } catch {
      await ctx.close();
      return false;
    }
    await page.waitForTimeout(2_500);
    const ok = await reussi(page);
    await ctx.close();
    return ok;
  }

  const etat = (a: number) =>
    essai(
      a,
      (p) =>
        p
          .getByRole('banner')
          .getByRole('button', { name: 'Recherche' })
          .click({ timeout: 8_000 }),
      (p) =>
        p.getByRole('dialog', { name: 'Rechercher sur le site' }).isVisible(),
    );
  const navigation = (a: number) =>
    essai(
      a,
      (p) =>
        p
          .getByRole('banner')
          .getByRole('button', { name: 'EN' })
          .click({ timeout: 8_000 }),
      async (p) => /\/en$/.test(p.url()),
    );

  const t0 = { etat: await etat(0), nav: await navigation(0) };
  const t500 = { etat: await etat(500), nav: await navigation(500) };
  console.log(
    `[F-13] à 0 ms   — état local ${t0.etat ? 'OK' : '--'} · navigation ${t0.nav ? 'OK' : '--'}`,
  );
  console.log(
    `[F-13] à 500 ms — état local ${t500.etat ? 'OK' : '--'} · navigation ${t500.nav ? 'OK' : '--'}`,
  );
  // What is asserted is not the failure (the finding is OPEN; making it
  // permanently red would teach people to ignore red) but the fact that the
  // two kinds of gesture behave THE SAME. That is what disqualifies
  // "it's this particular component" as an explanation.
  expect(t0.etat).toBe(t0.nav);
  expect(t500.etat).toBe(t500.nav);
});

test('F-13 — la bascule de langue, au repos et sous charge', async ({
  browser,
}, info) => {
  // ONE PROJECT ONLY: this is a MACHINE measurement, not a viewport one. Replaying it
  // on mobile would double it without learning anything — and cost two more
  // minutes. The FILE-level form does not receive `testInfo` in the
  // Playwright pinned here (1.61): `info` was `undefined` there, and the test
  // failed instead of being skipped.
  test.skip(info.project.name !== 'desktop', 'mesure de machine, un projet');
  test.setTimeout(600_000);
  const repos = await tauxDeReussite(browser, 1);
  const bride = await tauxDeReussite(browser, 4);
  console.log(`[F-13] bridage ×1 — ${repos}/${N} bascules abouties`);
  console.log(
    `[F-13] bridage ×4 — ${bride}/${N} bascules abouties ` +
      `(0 = le constat se reproduit ; ${N} = il a été corrigé)`,
  );
  // THE ASSERTION NO LONGER BEARS ON THE RATES. With the cause fixed, the gap has
  // disappeared; a threshold on these numbers would be load-sensitive — the trap
  // this file documents above, and into which its first version
  // fell. So we assert the DETERMINISTIC invariant that was fixed.
  const ecart = await ecartDeMiseEnPage(browser);
  console.log(
    `[F-13] décalage de l'en-tête, servi → établi : ${ecart.toFixed(1)} px ` +
      `(104 px = le défaut est revenu)`,
  );
  expect(ecart).toBeLessThanOrEqual(8);
});

// The THIRD part, and the one that shifts the finding: the header is inert
// while the footer ALREADY responds.
//
// Consent must be set for the origin actually served, otherwise the
// cookie banner — `fixed inset-x-0 bottom-0` — intercepts the footer
// click and we measure an occlusion while believing we are measuring hydration. That is
// exactly the mistake this measurement first made.
const CONSENTI = {
  cookies: [],
  origins: [
    {
      origin: BASE,
      localStorage: [{ name: 'dt-cookie-consent', value: 'essential' }],
    },
  ],
};

test('F-13 — en-tête et pied de page, au même instant', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'mesure de machine, un projet');
  test.setTimeout(600_000);

  const M = 3;
  async function taux(
    selecteur: string,
    reussi: (p: import('@playwright/test').Page) => Promise<boolean>,
  ): Promise<number> {
    let ok = 0;
    for (let i = 0; i < M; i++) {
      const ctx = await browser.newContext({
        locale: 'fr-FR',
        viewport: { width: 1280, height: 800 },
        storageState: CONSENTI,
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // No wait: the gesture fires as soon as `goto()` returns, as in
      // the repo's specs.
      await page.goto(`${BASE}/fr`);
      try {
        await page.locator(selecteur).first().click({ timeout: 8_000 });
        await page.waitForTimeout(2_500);
        if (await reussi(page)) ok++;
      } catch {
        /* click impossible: counted as a failure */
      }
      await ctx.close();
    }
    return ok;
  }

  const entete = await taux(
    'header button[lang="en"]',
    async (p) => new URL(p.url()).pathname === '/en',
  );
  const pied = await taux(
    'footer button[aria-label="Changer de thème"]',
    async (p) =>
      (await p.locator('html').getAttribute('data-theme')) === 'dark',
  );
  console.log(`[F-13] en-tête (bascule de langue) — ${entete}/${M} abouties`);
  console.log(`[F-13] pied de page (bouton thème) — ${pied}/${M} abouties`);

  // We do NOT assert that the header fails: the day the cause is found,
  // this test must turn green on its own, not red. We assert the order, which
  // does not depend on machine load: the footer never does
  // WORSE than the header. If that ever reversed, it is a new fact
  // and it deserves to turn red.
  expect(pied).toBeGreaterThanOrEqual(entete);
});
