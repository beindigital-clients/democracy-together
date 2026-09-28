import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// INSTRUMENTS D'ACCESSIBILITÉ, en un seul endroit.
//
// Ils vivaient dans `a11y.spec.ts`, donc hors de portée des specs mobiles. Les
// recopier aurait donné deux méthodologies qui divergent en silence — c'est
// exactement ce que l'audit a constaté entre sa propre suite et celle du dépôt
// (une analyse sans dérouler les `Reveal` annonçait des centaines de fausses
// violations de contraste). Un instrument ne vaut que s'il est le même partout.

export const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// `color-contrast` FAIT PARTIE DU GATE depuis le lot 3 du 27/09. La règle
// avait été différée parce que les écarts restants tenaient à la palette de
// marque (univers safran des Jeunes, couleurs data-viz bar-2/bar-4 en petit
// texte). Ils ont été résolus sans quitter la maquette : le texte sur safran
// prend l'encre (`--accent-contrast`), les barres de données ont une teinte
// « encre » dédiée pour le texte (`--bar-2-ink`, `--bar-4-ink`), et les plus
// petites tailles sont montées à 11 px. Mesuré à zéro violation, clair et
// sombre, sur les pages du spec `a11y`. La liste reste là pour qu'une règle à
// différer un jour le soit AU MÊME ENDROIT pour toutes les specs — avec sa
// raison écrite ici.
export const DEFERRED_RULES: string[] = [];

// Les contenus animés (Reveal `whileInView`) démarrent à opacity:0 : axe lirait
// une couleur de texte fondue (faux positif de contraste). On parcourt la page
// (les reveals sont `once:true`) pour les amener à leur état final, puis on
// laisse les animations se terminer avant l'analyse.
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
  // Une liste révélée en cascade (`staggerChildren` 0,1 s) finit d'autant plus
  // tard qu'elle est longue : 24 billets de Tribune → ~3 s. Une attente fixe
  // laissait axe mesurer les derniers encore à demi transparents (vu le 28/09
  // sur une base locale chargée). On attend donc que chaque élément révélé
  // ET affiché soit opaque, dans une limite.
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
      // Un élément resté masqué exprès n'est pas une raison d'échouer ici :
      // l'analyse axe tranchera.
    });
}

export function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).disableRules(DEFERRED_RULES);
}

type Violations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];

// Liste plate « règle [impact] cible » -> diff d'échec lisible.
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
 * WCAG 2.2, critère 2.5.8 « Taille de cible (minimum) », niveau AA.
 *
 * Une cible fait au moins 24 × 24 px CSS, SAUF si un cercle de 24 px de
 * diamètre centré sur elle ne recoupe ni le RECTANGLE d'une autre cible, ni le
 * CERCLE d'une autre cible sous-dimensionnée (exception « espacement »).
 *
 * L'exception n'est pas une formalité : sans elle, un balayage des 24 pages
 * publiques rend 568 cibles « fautives » — et un scan bruyant ne fait pas que
 * surestimer, il cache. Avec elle, il en reste zéro.
 *
 * ATTENTION en relisant : la distance se calcule du CENTRE de la cible au
 * RECTANGLE de la voisine. Confondre le centre et le coin décale chaque
 * rectangle d'une demi-largeur — la première version de ce détecteur annonçait
 * ainsi une non-conformité sur `/fr/connexion` qui n'existait pas.
 * `tests/e2e/mobile/a11y-menu.spec.ts` lui injecte un témoin pour qu'il ne
 * puisse pas rendre zéro par construction.
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

/** Scan complet d'une page ouverte : échoue sur « serious »/« critical ». */
export async function attendreAucuneViolationGrave(page: Page, quoi: string) {
  const { violations } = await scan(page).analyze();
  expect(summarize(violations), quoi).toEqual([]);
}

// ---------------------------------------------------------------------------
// INSTRUMENTS DE L'AUDIT RGAA (F-08, 27/09) — clavier, focus, affichage.
//
// Ce sont ceux qui ont produit la grille `docs/rgaa/grille.csv` : les specs
// `a11y-clavier`, `a11y-annonces` et `a11y-affichage` les rejouent pour que
// les constats de l'audit restent vrais — ou que leur régression se voie.

/** Neutralise les transitions : un style de focus lu pendant son fondu
 *  mesure l'état de DÉPART (mesuré : bordure de champ lue grise alors
 *  qu'elle passait au bleu). */
export async function sansTransitions(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important}',
  });
}

export type ArretClavier = {
  /** `null` : le focus est revenu sur le document (fin de la séquence). */
  nom: string | null;
  balise: string;
  /** Élément focalisé mais invisible (1 px, masqué, opacité nulle…). */
  cache: boolean;
  /** Ce qui change entre l'état focalisé et l'état non focalisé. */
  indicateur: string[];
  /** Déjà focalisé plus tôt dans la séquence. */
  repete: boolean;
};

/**
 * Indicateur de focus de l'élément ACTIF : ce qui distingue son état focalisé
 * de son état non focalisé (RGAA 10.7) — un contour, une ombre, un
 * soulignement, un fond ou une bordure qui change. Vide = focus invisible.
 *
 * Le composant focalisable peut être MASQUÉ (bouton radio `sr-only` dont la
 * pastille porte le style) : on lit alors le premier ancêtre visible, qui est
 * ce que la personne voit. Un élément focalisé qui reste invisible est signalé
 * par `cache`.
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
 * Parcourt la page à la TOUCHE TABULATION seule, depuis le haut, jusqu'à ce
 * que le focus revienne au document (fin de séquence) ou qu'un élément déjà
 * vu revienne (boucle). Une séquence qui boucle sans jamais rendre la main est
 * un PIÈGE AU CLAVIER (RGAA 12.9).
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

/** Largeur de page qui dépasse la fenêtre (RGAA 10.11) — 0 si aucune. */
export function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/**
 * Zoom du TEXTE seul à 200 % (RGAA 10.4), à la manière du « zoom texte
 * seulement » de Firefox : chaque taille de police calculée est doublée, les
 * interlignes en pixels aussi. Chromium n'a pas d'équivalent natif — le zoom
 * de PAGE, lui, se teste par une fenêtre deux fois plus étroite.
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

/** Espacement du texte redéfini par l'utilisateur (RGAA 10.12). */
export async function espacerLeTexte(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important} p{margin-bottom:2em!important}',
  });
}

/**
 * Textes ROGNÉS par un ancêtre `overflow: hidden|clip` dans le contenu
 * principal : ce que 10.4 et 10.12 appellent une perte de contenu. Hors champ :
 * les troncatures VOULUES (points de suspension, `line-clamp` — le texte entier
 * est sur la page de destination) et le contenu masqué (replié dans un
 * `<details>`, `sr-only`, `aria-hidden`).
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
        // Conteneur DÉFILANT (tableau dans sa `ScrollableRegion`) : le texte
        // n'est pas perdu, il s'atteint en faisant défiler — c'est
        // l'exception prévue par 10.11 pour les tableaux de données.
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
