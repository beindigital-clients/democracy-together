import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ACCESSIBILITY INSTRUMENTS, in a single place.
//
// They used to live in `a11y.spec.ts`, hence out of reach of the mobile specs.
// Copying them would have produced two methodologies silently diverging — that
// is exactly what the audit found between its own suite and the repo's
// (an analysis without unrolling the `Reveal`s reported hundreds of false
// contrast violations). An instrument is only worth anything if it is the same everywhere.

export const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// `color-contrast` IS PART OF THE GATE since batch 3 of 27/09. The rule
// had been deferred because the remaining gaps came from the brand palette
// (saffron universe of the Youth hub, data-viz colors bar-2/bar-4 in small
// text). They were resolved without leaving the mockup: text on saffron
// takes the ink (`--accent-contrast`), the data bars have a dedicated "ink"
// shade for text (`--bar-2-ink`, `--bar-4-ink`), and the smallest
// sizes were raised to 11 px. Measured at zero violations, light and
// dark, on the pages of the `a11y` spec. The list stays here so that a rule
// deferred some day is deferred IN THE SAME PLACE for all specs — with its
// reason written here.
export const DEFERRED_RULES: string[] = [];

// Animated content (Reveal `whileInView`) starts at opacity:0: axe would read
// a faded text color (contrast false positive). We scroll through the page
// (reveals are `once:true`) to bring them to their final state, then let
// the animations finish before the analysis.
export async function revealAll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const total = document.body.scrollHeight;
    for (let y = 0; y <= total; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
  });
  // A list revealed in cascade (`staggerChildren` 0.1 s) finishes later the
  // longer it is: 24 Tribune posts → ~3 s. A fixed wait let axe measure the
  // last ones while still half transparent (seen on 28/09 on a loaded local
  // database). So we wait until every revealed AND displayed element is
  // opaque, within a limit.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-reveal]')).every((el) => {
          const box = el.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) return true;
          return getComputedStyle(el).opacity === '1';
        }),
      undefined,
      { timeout: 8_000, polling: 100 },
    )
    .catch(() => {
      // An element deliberately left hidden is no reason to fail here:
      // the axe analysis will decide.
    });
}

export function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).disableRules(DEFERRED_RULES);
}

type Violations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];

// Flat "rule [impact] target" list -> readable failure diff.
export function summarize(violations: Violations): string[] {
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) =>
      v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')}`),
    );
}

export type CibleFautive = {
  quoi: string;
  taille: string;
  margeManquante: number;
  voisine: string;
};

/**
 * WCAG 2.2, success criterion 2.5.8 "Target Size (Minimum)", level AA.
 *
 * A target is at least 24 × 24 CSS px, UNLESS a 24 px diameter circle
 * centered on it intersects neither the RECTANGLE of another target, nor the
 * CIRCLE of another undersized target ("spacing" exception).
 *
 * The exception is no formality: without it, a sweep of the 24 public pages
 * yields 568 "faulty" targets — and a noisy scan does not just overestimate,
 * it hides. With it, zero remain.
 *
 * CAREFUL when reviewing: the distance is computed from the target's CENTER
 * to the neighbor's RECTANGLE. Confusing the center and the corner shifts
 * each rectangle by half a width — the first version of this detector thus
 * reported a non-conformity on `/fr/connexion` that did not exist.
 * `tests/e2e/mobile/a11y-menu.spec.ts` injects a control case into it so it
 * cannot return zero by construction.
 */
export function ciblesTropPetites(
  page: Page,
  racine = 'body',
): Promise<CibleFautive[]> {
  return page
    .locator(racine)
    .locator('a, button, [role="button"], input:not([type="hidden"]), select')
    .evaluateAll((els) => {
      const cibles = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            el,
            cx: r.x + r.width / 2,
            cy: r.y + r.height / 2,
            gauche: r.x,
            haut: r.y,
            w: r.width,
            h: r.height,
            quoi: `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 30)}`,
          };
        })
        .filter((c) => c.w > 0 && c.h > 0);

      const distanceAuRect = (
        px: number,
        py: number,
        r: { gauche: number; haut: number; w: number; h: number },
      ) =>
        Math.hypot(
          Math.max(r.gauche - px, 0, px - (r.gauche + r.w)),
          Math.max(r.haut - py, 0, py - (r.haut + r.h)),
        );

      return cibles
        .filter((c) => c.w < 24 || c.h < 24)
        .map((c) => {
          let marge = Infinity;
          let voisine = '';
          for (const o of cibles) {
            if (o.el === c.el) continue;
            const petite = o.w < 24 || o.h < 24;
            const m = petite
              ? Math.hypot(c.cx - o.cx, c.cy - o.cy) - 24
              : distanceAuRect(c.cx, c.cy, o) - 12;
            if (m < marge) {
              marge = m;
              voisine = o.quoi;
            }
          }
          return {
            quoi: c.quoi,
            taille: `${Math.round(c.w)}x${Math.round(c.h)}`,
            margeManquante: Math.round(marge * 10) / 10,
            voisine,
          };
        })
        .filter((c) => c.margeManquante < 0);
    });
}

/** Full scan of an open page: fails on "serious"/"critical". */
export async function attendreAucuneViolationGrave(page: Page, quoi: string) {
  const { violations } = await scan(page).analyze();
  expect(summarize(violations), quoi).toEqual([]);
}

// ---------------------------------------------------------------------------
// RGAA AUDIT INSTRUMENTS (F-08, 27/09) — keyboard, focus, display.
//
// These are the ones that produced the `docs/rgaa/grille.csv` grid: the
// `a11y-clavier`, `a11y-annonces` and `a11y-affichage` specs replay them so
// that the audit findings stay true — or that their regression shows.

/** Neutralizes transitions: a focus style read during its fade
 *  measures the STARTING state (measured: a field border read as gray
 *  while it was turning blue). */
export async function sansTransitions(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important}',
  });
}

export type ArretClavier = {
  /** `null`: focus went back to the document (end of the sequence). */
  nom: string | null;
  balise: string;
  /** Element focused but invisible (1 px, hidden, zero opacity…). */
  cache: boolean;
  /** What changes between the focused and the unfocused state. */
  indicateur: string[];
  /** Already focused earlier in the sequence. */
  repete: boolean;
};

/**
 * Focus indicator of the ACTIVE element: what distinguishes its focused state
 * from its unfocused state (RGAA 10.7) — an outline, a shadow, an
 * underline, a background or a border that changes. Empty = invisible focus.
 *
 * The focusable component may be HIDDEN (an `sr-only` radio button whose
 * dot carries the style): we then read the first visible ancestor, which is
 * what the person sees. A focused element that stays invisible is flagged
 * by `cache`.
 */
export function lireIndicateurDeFocus(page: Page): Promise<ArretClavier> {
  return page.evaluate(() => {
    type Fenetre = { __rgaaVus?: Set<Element> };
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return {
        nom: null,
        balise: 'body',
        cache: false,
        indicateur: [],
        repete: false,
      };
    }
    const petit = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width <= 2 || r.height <= 2;
    };
    const style = getComputedStyle(el);
    const cache =
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      !!el.closest('[aria-hidden="true"]');
    let porteur: Element = el;
    while (petit(porteur) && porteur.parentElement) {
      porteur = porteur.parentElement;
    }
    const lire = (e: Element) => {
      const s = getComputedStyle(e);
      return {
        contour:
          s.outlineStyle === 'none'
            ? 'none'
            : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        ombre: s.boxShadow,
        bordure: `${s.borderTopColor} ${s.borderBottomColor}`,
        fond: s.backgroundColor,
        soulignement: s.textDecorationLine,
      };
    };
    const focalise = lire(porteur);
    el.blur();
    const repos = lire(porteur);
    el.focus({ preventScroll: true });
    const indicateur: string[] = [];
    if (focalise.contour !== repos.contour && focalise.contour !== 'none') {
      indicateur.push(`contour ${focalise.contour}`);
    }
    if (focalise.ombre !== repos.ombre) indicateur.push('ombre');
    if (focalise.bordure !== repos.bordure) indicateur.push('bordure');
    if (focalise.fond !== repos.fond) indicateur.push('fond');
    if (focalise.soulignement !== repos.soulignement) {
      indicateur.push('soulignement');
    }
    const nom = (
      el.getAttribute('aria-label') ||
      (el as HTMLInputElement).labels?.[0]?.textContent ||
      el.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    const w = window as unknown as Fenetre;
    const vus = w.__rgaaVus ?? new Set<Element>();
    w.__rgaaVus = vus;
    const repete = vus.has(el);
    vus.add(el);
    return {
      nom,
      balise: el.tagName.toLowerCase(),
      cache,
      indicateur,
      repete,
    };
  });
}

/**
 * Walks the page with the TAB KEY alone, from the top, until focus returns
 * to the document (end of sequence) or an already-seen element comes back
 * (loop). A sequence that loops without ever giving control back is a
 * KEYBOARD TRAP (RGAA 12.9).
 */
export async function parcourirAuClavier(
  page: Page,
  max = 260,
): Promise<{ arrets: ArretClavier[]; finAtteinte: boolean }> {
  await page.evaluate(() => {
    delete (window as unknown as { __rgaaVus?: Set<Element> }).__rgaaVus;
    window.scrollTo(0, 0);
  });
  const arrets: ArretClavier[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const arret = await lireIndicateurDeFocus(page);
    if (arret.nom === null) return { arrets, finAtteinte: true };
    if (arret.repete) return { arrets, finAtteinte: false };
    arrets.push(arret);
  }
  return { arrets, finAtteinte: false };
}

/** Page width overflowing the window (RGAA 10.11) — 0 if none. */
export function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/**
 * TEXT-only zoom at 200 % (RGAA 10.4), like Firefox's "zoom text
 * only": every computed font size is doubled, and so are pixel line
 * heights. Chromium has no native equivalent — PAGE zoom, for its part, is
 * tested with a window half as wide.
 */
export async function zoomerLeTexte(page: Page, facteur = 2): Promise<void> {
  await page.evaluate((f) => {
    const valeurs = [
      ...document.querySelectorAll<HTMLElement>('body, body *'),
    ].map((e) => {
      const s = getComputedStyle(e);
      return [e, parseFloat(s.fontSize), s.lineHeight] as const;
    });
    for (const [e, taille, interligne] of valeurs) {
      e.style.setProperty('font-size', `${taille * f}px`, 'important');
      if (interligne.endsWith('px')) {
        e.style.setProperty(
          'line-height',
          `${parseFloat(interligne) * f}px`,
          'important',
        );
      }
    }
  }, facteur);
}

/** Text spacing overridden by the user (RGAA 10.12). */
export async function espacerLeTexte(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important} p{margin-bottom:2em!important}',
  });
}

/**
 * Texts CLIPPED by an `overflow: hidden|clip` ancestor in the main
 * content: what 10.4 and 10.12 call a loss of content. Out of scope:
 * INTENDED truncations (ellipsis, `line-clamp` — the full text is on the
 * destination page) and hidden content (collapsed in a `<details>`,
 * `sr-only`, `aria-hidden`).
 */
export function textesRognes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const feuilles = [
      ...document.querySelectorAll<HTMLElement>('main *'),
    ].filter((e) =>
      [...e.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim(),
      ),
    );
    for (const e of feuilles) {
      if (
        e.closest(
          '.sr-only, [aria-hidden="true"], details:not([open]), [hidden]',
        )
      ) {
        continue;
      }
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let a = e.parentElement;
      while (a && a !== document.body) {
        const s = getComputedStyle(a);
        if (
          s.textOverflow === 'ellipsis' ||
          s.getPropertyValue('-webkit-line-clamp') !== 'none'
        ) {
          break;
        }
        // SCROLLING container (table in its `ScrollableRegion`): the text
        // is not lost, it is reached by scrolling — this is the exception
        // 10.11 provides for data tables.
        if (/(auto|scroll)/.test(`${s.overflowX} ${s.overflowY}`)) break;
        if (/(hidden|clip)/.test(`${s.overflowX} ${s.overflowY}`)) {
          const ra = a.getBoundingClientRect();
          if (
            r.bottom > ra.bottom + 2 ||
            r.right > ra.right + 2 ||
            r.left < ra.left - 2
          ) {
            out.push(
              `${e.tagName.toLowerCase()} « ${(e.textContent ?? '').trim().slice(0, 40)} »`,
            );
          }
          break;
        }
        a = a.parentElement;
      }
    }
    return out;
  });
}
