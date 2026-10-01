import { type Locator, type Page } from '@playwright/test';
import { ouvrirPanneau } from './_panneau';

// THE LANGUAGE SWITCHER IS A MENU, and four specs drove it through its
// previous form: a segmented row where each language was a button ALWAYS
// present in the document (`header button[lang="en"]`, a
// `role="group"` named "Langue", the active one marked `aria-pressed`).
//
// With five languages this row no longer fits in the bar, and "العربية" has
// no two-letter short form: the component became a trigger that opens a
// menu. Consequence for the tests, and it is the whole reason for this
// file: THE LANGUAGES DO NOT EXIST WHILE THE MENU IS CLOSED. A
// `page.locator('header button[lang="en"]').click()` no longer waits for a
// slow element, it waits for an element that will never come.
//
// The two anchors of the new form are gathered here so that the next
// change to the component is dealt with in a single place, and not in
// four files that had each copied the same selector.
//
// WHY THESE ANCHORS.
//
// The trigger is identified by `aria-haspopup="menu"` — the only one in the
// header bar, the search palette announcing `aria-haspopup="dialog"`. Above all,
// it is not a label: the button's accessible name is TRANSLATED ("Langue",
// "Language", "اللغة"), and a spec that goes across languages cannot
// hook onto it. Where the label itself is at stake — the English of
// `en-journey.spec.ts`, which exists to catch a string left in
// French —, the specs target the plain accessible name, deliberately.
//
// The entries keep the `lang` attribute the specs already targeted. Their
// label is an ENDONYM ("Español", not "Espagnol"), hence identical in
// all five languages and usable as is; `lang` nevertheless remains the
// shortest anchor, and the one that will not move if an endonym is corrected.
// Since the menu became the shadcn `DropdownMenu` (Radix), an entry is a
// `menuitemradio` element rather than a `<button>`: the anchor is the role
// plus `lang`. The menu is rendered next to its button, not portalled to
// <body>, so the scope below still holds.

// THE SCOPE IS EXPLICIT because there are TWO switchers in the document.
// The mobile menu mounts a second one when expanded, and the desktop cluster
// does not disappear for all that: below 1120 px it is `hidden`, hence still
// present but neither visible nor clickable. An unqualified selector would
// land on it and the spec would fail on a hidden element, which says nothing.
// Hence `racine`: the mobile panel specs pass `#mobile-nav`.
function dans(page: Page, racine?: Locator): Locator {
  return racine ?? page.locator('header');
}

/** The button that opens the language menu. By default, the header bar one. */
export function declencheurLangue(page: Page, racine?: Locator): Locator {
  return dans(page, racine).locator('button[aria-haspopup="menu"]').first();
}

/** The expanded menu. Absent from the document while it is not open. */
export function menuLangue(page: Page, racine?: Locator): Locator {
  return dans(page, racine).locator('[role="menu"]').first();
}

/** A language's entry in the OPEN menu. */
export function choixLangue(
  page: Page,
  locale: string,
  racine?: Locator,
): Locator {
  return dans(page, racine)
    .locator(`[role="menuitemradio"][lang="${locale}"]`)
    .first();
}

/**
 * Opens the language menu, and returns the menu.
 *
 * `ouvrirPanneau` rather than a bare click, for two reasons that add up.
 *
 * First because this click immediately follows a `page.goto()` in almost
 * every spec that uses it: that is exactly the shape the F-13 audit
 * measured as losing its effect (three of its four occurrences).
 * The old segmented row exposed the same gesture, and the specs already
 * protected it — that protection must not disappear along the way.
 *
 * Then because the trigger is a TOGGLE: a second click on an already open
 * menu would CLOSE it. That is the case `ouvrirPanneau` was written
 * for — it only re-clicks while the panel is closed, and prints the
 * number of attempts —, whereas `cliquerJusqua` is meant for idempotent gestures.
 */
export async function ouvrirSelecteurDeLangue(
  page: Page,
  racine?: Locator,
): Promise<Locator> {
  const menu = menuLangue(page, racine);
  await ouvrirPanneau(
    declencheurLangue(page, racine),
    menu,
    'sélecteur de langue',
  );
  return menu;
}
