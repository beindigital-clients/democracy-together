import { type Locator, type Page } from '@playwright/test';
import { ouvrirPanneau } from './_panneau';

// LE SÉLECTEUR DE LANGUE EST UN MENU, et quatre specs le pilotaient par sa
// forme précédente : une rangée segmentée où chaque langue était un bouton
// TOUJOURS présent dans le document (`header button[lang="en"]`, un
// `role="group"` nommé « Langue », l'active marquée `aria-pressed`).
//
// À cinq langues cette rangée ne tient plus dans la barre, et « العربية » n'a
// pas de forme courte à deux lettres : le composant est devenu un déclencheur
// qui ouvre un menu. Conséquence pour les tests, et c'est toute la raison de ce
// fichier : LES LANGUES N'EXISTENT PLUS TANT QUE LE MENU EST FERMÉ. Un
// `page.locator('header button[lang="en"]').click()` n'attend plus un élément
// lent, il attend un élément qui ne viendra jamais.
//
// Les deux repères de la nouvelle forme sont rassemblés ici pour que la
// prochaine évolution du composant se règle à un seul endroit, et non dans
// quatre fichiers qui avaient chacun recopié le même sélecteur.
//
// POURQUOI CES REPÈRES-LÀ.
//
// Le déclencheur est désigné par `aria-haspopup="menu"` — le seul du bandeau,
// la palette de recherche annonçant `aria-haspopup="dialog"`. Surtout, ce
// n'est pas un libellé : le nom accessible du bouton est TRADUIT (« Langue »,
// « Language », « اللغة »), et une spec qui traverse les langues ne peut pas
// s'y accrocher. Là où c'est le libellé lui-même qui est en jeu — l'anglais de
// `en-journey.spec.ts`, qui existe pour attraper une chaîne restée en
// français —, les specs visent le nom accessible en clair, délibérément.
//
// Les entrées gardent l'attribut `lang` que les specs visaient déjà. Leur
// libellé est un ENDONYME (« Español », pas « Espagnol »), donc identique dans
// les cinq langues et utilisable tel quel ; `lang` reste néanmoins le repère
// le plus court, et celui qui ne bougera pas si un endonyme est corrigé.

// LA PORTÉE EST EXPLICITE parce qu'il y a DEUX sélecteurs dans le document.
// Le menu mobile en monte un second quand il est déployé, et la grappe desktop
// ne disparaît pas pour autant : sous 1120 px elle est `hidden`, donc toujours
// présente mais ni visible ni cliquable. Un sélecteur non qualifié tomberait
// dessus et la spec échouerait sur un élément masqué, ce qui ne dit rien.
// D'où `racine` : les specs du panneau mobile passent `#mobile-nav`.
function dans(page: Page, racine?: Locator): Locator {
  return racine ?? page.locator('header');
}

/** Le bouton qui ouvre le menu des langues. Par défaut celui du bandeau. */
export function declencheurLangue(page: Page, racine?: Locator): Locator {
  return dans(page, racine).locator('button[aria-haspopup="menu"]').first();
}

/** Le menu déployé. Absent du document tant qu'il n'est pas ouvert. */
export function menuLangue(page: Page, racine?: Locator): Locator {
  return dans(page, racine).locator('[role="menu"]').first();
}

/** L'entrée d'une langue dans le menu OUVERT. */
export function choixLangue(
  page: Page,
  locale: string,
  racine?: Locator,
): Locator {
  return dans(page, racine).locator(`button[lang="${locale}"]`).first();
}

/**
 * Ouvre le menu des langues, et rend le menu.
 *
 * `ouvrirPanneau` plutôt qu'un clic nu, pour deux raisons qui se cumulent.
 *
 * D'abord parce que ce clic suit immédiatement un `page.goto()` dans presque
 * toutes les specs qui l'emploient : c'est exactement la forme que l'audit
 * F-13 a mesurée comme perdant son effet (trois de ses quatre occurrences).
 * L'ancienne rangée segmentée exposait le même geste, et les specs le
 * protégeaient déjà — cette protection ne doit pas disparaître au passage.
 *
 * Ensuite parce que le déclencheur est une BASCULE : un second clic sur un
 * menu déjà ouvert le REFERMERAIT. C'est le cas pour lequel `ouvrirPanneau` a
 * été écrit — il ne re-clique que tant que le panneau est fermé, et imprime le
 * nombre d'essais —, là où `cliquerJusqua` s'adresse aux gestes idempotents.
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
