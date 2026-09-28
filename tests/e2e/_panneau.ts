import { expect, type Locator } from '@playwright/test';

// WHY WAS A SECOND CLICK NEEDED? The counter alone does not say, and
// that is what cost the most time on F-13.
//
// One cause is established and fixed: the header shifted by 104 px when
// authentication resolved, and the click landed next to the button
// (`join-button.tsx`). But the campaign that followed this fix STILL
// carried `[F-13]` lines: so there is at least one other mechanism left, and
// it does not occur on the audit machine.
//
// This probe records the trigger's position BEFORE each click. If a second
// click is needed, the log says whether it had moved in between —
// either "it is a shift again", or "it is something else", without having to
// wait for one more campaign to ask the question.
//
// ITS FIRST CAMPAIGN SAID NOTHING: `boundingBox()` returned `null` and the
// verdict stayed empty. Fixed below — it now speaks even when it
// fails. Also to watch: measuring before each click adds a round
// trip, hence time. On that same campaign the number of absorbed clicks
// went from four to two; ONE campaign does not tell whether it was the
// probe that moved the result or ordinary variance. Not to be
// decided before having several.
class Mouchard {
  private precedente: { x: number; y: number; nul: boolean } | null = null;
  private urlPrecedente: string | null = null;
  private constat = " — (le mouchard n'a pas pu comparer)";

  // `getBoundingClientRect` via `evaluate`, and NOT `boundingBox()`: the latter
  // returns `null` as soon as it deems the element not visible, and the first
  // instrumented campaign then printed NOTHING. A silent probe is exactly the
  // failure mode this finding is tracking: it now always says
  // something, including its own failure.
  //
  // THE URL IS RECORDED TOO, and that is what separates a LOST click from a
  // click FIRED DURING A NAVIGATION. First telling campaign: `home.spec.ts`
  // reported "déplacé de -998×-20 px" — too much for a header reflow, but
  // exactly what one measures on a document already changing. If
  // the URL moved between the two clicks, the first one had landed and the counter
  // overestimates; if it did not move, the click was indeed lost.
  async avantClic(declencheur: Locator): Promise<void> {
    const url = declencheur.page().url();
    const b = await declencheur
      .evaluate((el) => {
        const h = el as HTMLElement;
        const r = h.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          // A ZERO rectangle is not a position: it is a hidden
          // (`display:none`) or detached element. Without this distinction the probe
          // reports a "shift" the size of the page, which never
          // happened — that is what it did with `-998×-20 px`.
          nul: r.width === 0 && r.height === 0,
        };
      })
      .catch(() => null);
    const bougee =
      this.urlPrecedente !== null && this.urlPrecedente !== url
        ? ', URL DÉJÀ CHANGÉE entre les deux clics'
        : this.urlPrecedente !== null
          ? ', URL inchangée'
          : '';
    if (!b) {
      this.constat = ` — position du déclencheur illisible${bougee}`;
    } else if (b.nul) {
      this.constat = ` — déclencheur MASQUÉ au second clic (rectangle nul)${bougee}`;
    } else if (this.precedente) {
      const dx = b.x - this.precedente.x;
      const dy = b.y - this.precedente.y;
      this.constat =
        (dx || dy
          ? ` — le déclencheur s'était déplacé de ${dx}×${dy} px`
          : ' — sans déplacement du déclencheur') + bougee;
    }
    if (b && !b.nul) this.precedente = b;
    this.urlPrecedente = url;
  }

  verdict(): string {
    return this.constat;
  }
}

// Opening a panel that mounts ON CLICK, without masking a failure (audit F-13).
//
// WHY THIS HELPER EXISTS. `declencheur.click()` followed by
// `expect(panneau).toBeVisible()` can fail in only one way: the
// click produced NO state change. The assertion retries — a panel that is
// merely slow satisfies it. Yet that is what CI observed
// three times, on three different panels (confirmation dialog, search
// palette, mobile menu), never twice the same, with no root cause
// established to date.
//
// WHAT IT DOES, AND WHAT IT DOES NOT. It re-clicks ONLY while the
// panel is closed: never twice on an already open toggle, which would
// close again. And it PRINTS the number of attempts. A necessary second click
// thus stays visible in the CI log: the symptom is absorbed so that
// the gate stops turning red at random, it is not erased. The day these
// lines multiply, it is the finding itself that resurfaces.
//
// If the panel NEVER opens, the test fails as before.
export async function ouvrirPanneau(
  declencheur: Locator,
  panneau: Locator,
  nom: string,
): Promise<void> {
  let essais = 0;
  const mouchard = new Mouchard();
  await expect(async () => {
    if (!(await panneau.isVisible())) {
      await mouchard.avantClic(declencheur);
      essais += 1;
      await declencheur.click();
    }
    await expect(panneau).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  if (essais > 1) {
    console.log(
      `[F-13] ${nom} : ${essais} clics ont été nécessaires${mouchard.verdict()}`,
    );
  }
}

// Same symptom, NON-localizable effect (audit F-13, 4th occurrence).
//
// The CI run of 21/09 made `home.spec.ts:25` flaky: click on "EN" in the
// banner, then the URL stays on `/fr` — thirteen polls. It is NOT a
// panel opening, and that widens the family: what the occurrences
// share is not "a panel", it is a CLICK WHOSE EFFECT NEVER
// HAPPENS. Three of the four have the same shape, by the way — `page.goto()` followed
// immediately by a click.
//
// The expected effect here is a URL, not an element: hence a predicate. The
// same safeguards apply — we only re-click while the effect has NOT
// happened, and the number of attempts is printed.
//
// RESERVE FOR IDEMPOTENT gestures: re-clicking "EN" when already in
// English does nothing. On a toggle, use `ouvrirPanneau`.
export async function cliquerJusqua(
  declencheur: Locator,
  effetObtenu: () => Promise<boolean>,
  nom: string,
): Promise<void> {
  let essais = 0;
  const mouchard = new Mouchard();
  await expect(async () => {
    if (!(await effetObtenu())) {
      await mouchard.avantClic(declencheur);
      essais += 1;
      await declencheur.click();
      // GIVE THE EFFECT TIME TO HAPPEN before considering a second
      // click. Without this wait, an IN-FLIGHT NAVIGATION was counted as a
      // lost click: `page.url()` only reflects the new address once it
      // is committed, so the predicate stayed false and we
      // clicked again — on the next document, which had not yet done its
      // layout. That is the "déplacé de -998×-20 px" signature recorded in
      // CI: a zero rectangle, not a shift.
      //
      // A click that is REALLY lost never produces the effect: it exhausts
      // this wait, then the 20 seconds of `toPass`, and the test fails
      // as before. We mask nothing — we stop miscounting.
      const limite = Date.now() + 1_500;
      while (Date.now() < limite && !(await effetObtenu())) {
        await declencheur.page().waitForTimeout(50);
      }
    }
    expect(await effetObtenu(), `effet attendu : ${nom}`).toBe(true);
  }).toPass({ timeout: 20_000 });

  if (essais > 1) {
    console.log(
      `[F-13] ${nom} : ${essais} clics ont été nécessaires${mouchard.verdict()}`,
    );
  }
}
