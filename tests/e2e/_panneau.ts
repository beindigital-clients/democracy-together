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
