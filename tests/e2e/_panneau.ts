import { expect, type Locator } from '@playwright/test';

// POURQUOI UN SECOND CLIC A-T-IL ÉTÉ NÉCESSAIRE ? Le compteur seul ne le dit
// pas, et c'est ce qui a coûté le plus de temps sur F-13.
//
// Une cause est établie et corrigée : l'en-tête se décalait de 104 px quand
// l'authentification se résolvait, et le clic tombait à côté du bouton
// (`join-button.tsx`). Mais la campagne qui a suivi ce correctif portait
// TOUJOURS des lignes `[F-13]` : il reste donc au moins un autre mécanisme, et
// il ne se produit pas sur la machine d'audit.
//
// Ce mouchard note la position du déclencheur AVANT chaque clic. Si un second
// clic est nécessaire, le journal dit s'il s'était déplacé entre les deux —
// soit « c'est encore un décalage », soit « c'est autre chose », sans avoir à
// attendre une campagne de plus pour poser la question.
//
// SA PREMIÈRE CAMPAGNE N'A RIEN DIT : `boundingBox()` rendait `null` et le
// verdict restait vide. Corrigé ci-dessous — il parle maintenant même quand il
// échoue. À surveiller aussi : mesurer avant chaque clic ajoute un
// aller-retour, donc du temps. Sur cette même campagne le nombre de clics
// absorbés est passé de quatre à deux ; UNE campagne ne permet pas de dire si
// c'est la sonde qui a déplacé le résultat ou la variance ordinaire. À ne pas
// trancher avant d'en avoir plusieurs.
class Mouchard {
  private precedente: { x: number; y: number } | null = null;
  private constat = " — (le mouchard n'a pas pu comparer)";

  // `getBoundingClientRect` via `evaluate`, et NON `boundingBox()` : ce dernier
  // rend `null` dès qu'il juge l'élément non visible, et la première campagne
  // instrumentée n'a alors RIEN imprimé. Un mouchard muet est exactement le
  // mode de défaillance que ce constat traque depuis le début : il dit
  // désormais toujours quelque chose, y compris son propre échec.
  async avantClic(declencheur: Locator): Promise<void> {
    const b = await declencheur
      .evaluate((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y) };
      })
      .catch(() => null);
    if (!b) {
      this.constat = ' — position du déclencheur illisible';
      return;
    }
    if (this.precedente) {
      const dx = b.x - this.precedente.x;
      const dy = b.y - this.precedente.y;
      this.constat =
        dx || dy
          ? ` — le déclencheur s'était déplacé de ${dx}×${dy} px`
          : ' — sans déplacement du déclencheur';
    }
    this.precedente = b;
  }

  verdict(): string {
    return this.constat;
  }
}

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
  const mouchard = new Mouchard();
  await expect(async () => {
    if (!(await effetObtenu())) {
      await mouchard.avantClic(declencheur);
      essais += 1;
      await declencheur.click();
    }
    expect(await effetObtenu(), `effet attendu : ${nom}`).toBe(true);
  }).toPass({ timeout: 20_000 });

  if (essais > 1) {
    console.log(
      `[F-13] ${nom} : ${essais} clics ont été nécessaires${mouchard.verdict()}`,
    );
  }
}
