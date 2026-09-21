import { expect, type Locator } from '@playwright/test';

// Ouvrir un panneau qui se monte AU CLIC, sans masquer une panne (audit F-13).
//
// POURQUOI CE HELPER EXISTE. `declencheur.click()` suivi de
// `expect(panneau).toBeVisible()` ne peut échouer que d'une seule façon : le
// clic n'a produit AUCUN changement d'état. L'assertion, elle, réessaie — un
// panneau simplement lent la satisfait. C'est pourtant ce que la CI a observé
// trois fois, sur trois panneaux différents (dialogue de confirmation, palette
// de recherche, menu mobile), jamais deux fois le même, sans cause racine
// établie à ce jour.
//
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS. Il re-clique UNIQUEMENT tant que le
// panneau est fermé : jamais deux fois sur une bascule déjà ouverte, qui se
// refermerait. Et il IMPRIME le nombre d'essais. Un second clic nécessaire
// reste donc visible dans le journal de la CI : le symptôme est absorbé pour
// que la porte cesse de rougir au hasard, il n'est pas effacé. Le jour où ces
// lignes se multiplient, c'est le constat lui-même qui remonte.
//
// Si le panneau ne s'ouvre JAMAIS, le test échoue comme avant.
export async function ouvrirPanneau(
  declencheur: Locator,
  panneau: Locator,
  nom: string,
): Promise<void> {
  let essais = 0;
  await expect(async () => {
    if (!(await panneau.isVisible())) {
      essais += 1;
      await declencheur.click();
    }
    await expect(panneau).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  if (essais > 1) {
    console.log(`[F-13] ${nom} : ${essais} clics ont été nécessaires`);
  }
}

// Même symptôme, effet NON localisable (audit F-13, 4e occurrence).
//
// La CI du 21/09 a rendu `home.spec.ts:25` instable : clic sur « EN » dans la
// bannière, puis l'URL reste sur `/fr` — treize sondages. Ce n'est PAS un
// panneau qui s'ouvre, et cela élargit la famille : ce que les occurrences
// partagent n'est pas « un panneau », c'est un CLIC DONT L'EFFET NE SE PRODUIT
// JAMAIS. Trois des quatre ont d'ailleurs la même forme — `page.goto()` suivi
// immédiatement d'un clic.
//
// L'effet attendu est ici une URL, pas un élément : d'où un prédicat. Les
// mêmes garde-fous s'appliquent — on ne re-clique que tant que l'effet ne
// s'est PAS produit, et le nombre d'essais est imprimé.
//
// À RÉSERVER aux gestes IDEMPOTENTS : re-cliquer « EN » quand on est déjà en
// anglais ne fait rien. Sur une bascule, utiliser `ouvrirPanneau`.
export async function cliquerJusqua(
  declencheur: Locator,
  effetObtenu: () => Promise<boolean>,
  nom: string,
): Promise<void> {
  let essais = 0;
  await expect(async () => {
    if (!(await effetObtenu())) {
      essais += 1;
      await declencheur.click();
    }
    expect(await effetObtenu(), `effet attendu : ${nom}`).toBe(true);
  }).toPass({ timeout: 20_000 });

  if (essais > 1) {
    console.log(`[F-13] ${nom} : ${essais} clics ont été nécessaires`);
  }
}
