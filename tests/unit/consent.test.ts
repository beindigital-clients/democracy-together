// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONSENT_KEY,
  readConsent,
  writeConsent,
  hasAnalyticsConsent,
  type ConsentValue,
} from '@/lib/consent';

// Consentement cookies (F-09) — enjeu RGPD, aucune couverture jusqu'ici.
//
// La propriété qui compte n'est pas « la préférence est bien relue » : c'est
// que RIEN d'autre qu'un « all » explicitement enregistré ne vaut consentement.
// Le module est écrit pour GATER une mesure d'audience future ; le jour où un
// outil de mesure s'y branchera, chaque cas où `hasAnalyticsConsent()` rendrait
// `true` par accident — valeur absente, valeur abîmée, stockage indisponible,
// rendu serveur — sera un dépôt de traceur sans consentement.
//
// Les quatre chemins de sortie du module sont donc exercés ici, et tous doivent
// FERMER (`null` / `false`), jamais ouvrir.

// Les espions sont rendus UN PAR UN, et non par `vi.restoreAllMocks()`
// (audit F-01).
//
// Mesuré : sous happy-dom et Vitest 4, `restoreAllMocks()` ne restaure PAS un
// espion posé sur l'instance `window.localStorage`. Le `SecurityError` du test
// « stockage indisponible » survivait donc à l'`afterEach` et contaminait les
// suivants. En ordre de déclaration — celui de la CI — la suite restait verte ;
// en ordre mélangé elle rougissait six fois sur dix, jusqu'à douze tests d'un
// coup. Verte par chance d'ordonnancement, donc.
//
// Le piège est silencieux : tout test ajouté après ceux-ci héritait d'un
// `localStorage` qui lève, et aurait échoué pour une raison étrangère à son
// sujet — ou, pire, serait passé sans rien exercer.
//
// `mockRestore()` sur l'espion lui-même, lui, fonctionne : vérifié avant
// d'écrire ce correctif (`audit/poc/restore-fix.test.ts`). La remise en place
// manuelle (`window.localStorage.getItem = origine`) ne fonctionne PAS — le
// proxy de happy-dom ignore l'affectation.
const espions: { mockRestore: () => void }[] = [];

/** Pose un espion et l'inscrit pour restauration explicite. */
function espionner(
  methode: 'getItem' | 'setItem',
  implementation: (...args: never[]) => never,
) {
  const espion = vi
    .spyOn(window.localStorage, methode)
    .mockImplementation(implementation as never);
  espions.push(espion);
  return espion;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  while (espions.length) espions.pop()?.mockRestore();
});

describe('Consentement — lecture et écriture', () => {
  it('sans choix enregistré, la préférence est « pas encore répondu »', () => {
    // `null` et non « essential » : le bandeau doit s'afficher tant que le
    // visiteur n'a pas tranché. Confondre les deux le ferait disparaître sans
    // que personne n'ait rien choisi.
    expect(readConsent()).toBeNull();
  });

  it.each<ConsentValue>(['all', 'essential'])('relit le choix « %s »', (v) => {
    writeConsent(v);
    expect(readConsent()).toBe(v);
  });

  it('écrit sous une clé stable', () => {
    // La clé est le contrat avec les visiteurs déjà passés : la renommer
    // redemanderait son consentement à tout le monde.
    writeConsent('all');
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('all');
    expect(CONSENT_KEY).toBe('dt-cookie-consent');
  });

  it('un choix remplace le précédent', () => {
    writeConsent('all');
    writeConsent('essential');
    expect(readConsent()).toBe('essential');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  // Une valeur inattendue n'est pas un consentement : extension qui bricole le
  // stockage, ancien format, écriture d'un autre outil sur la même origine.
  it.each(['', 'ALL', 'true', '1', 'oui', '{"analytics":true}', 'null'])(
    'traite la valeur abîmée %o comme « pas de choix »',
    (brut) => {
      window.localStorage.setItem(CONSENT_KEY, brut);
      expect(readConsent()).toBeNull();
      expect(hasAnalyticsConsent()).toBe(false);
    },
  );
});

describe('hasAnalyticsConsent — la garde de la mesure d’audience', () => {
  it('n’est vraie QUE sur un « all » explicite', () => {
    expect(hasAnalyticsConsent()).toBe(false);
    writeConsent('essential');
    expect(hasAnalyticsConsent()).toBe(false);
    writeConsent('all');
    expect(hasAnalyticsConsent()).toBe(true);
  });

  // Rendu serveur : le module est importé par un composant client, mais le
  // premier rendu se fait sans `window`. Lever ici casserait la page ; rendre
  // `true` déposerait un traceur au nom d'un visiteur qui n'a rien dit.
  it('sans `window` (rendu serveur), ferme sans lever', () => {
    vi.stubGlobal('window', undefined);
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(() => writeConsent('all')).not.toThrow();
  });

  // Navigation privée, cookies tiers bloqués, quota plein : l'accès au stockage
  // LÈVE au lieu de rendre `null`. Le bandeau doit rester utilisable — et, là
  // encore, l'échec ne doit pas valoir consentement.
  it('stockage indisponible : ferme sans lever, à la lecture comme à l’écriture', () => {
    const indisponible = () => {
      throw new DOMException('refusé', 'SecurityError');
    };
    // Sur l'INSTANCE : happy-dom sert `localStorage` derrière un proxy, et un
    // correctif posé sur `Storage.prototype` ne serait jamais atteint — le test
    // passerait alors sans rien exercer du tout.
    espionner('getItem', indisponible);
    espionner('setItem', indisponible);

    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(() => writeConsent('all')).not.toThrow();
  });

  it('une écriture perdue ne se transforme pas en consentement mémorisé', () => {
    // Le visiteur clique « Tout accepter » alors que le stockage est bloqué :
    // le clic ne lève pas, mais rien n'a été retenu — la prochaine lecture doit
    // le dire, pas faire comme si le choix tenait.
    espionner('setItem', () => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    writeConsent('all');
    // Rendu ICI, au milieu du test : la suite du scénario a besoin d'un
    // stockage qui refonctionne pour prouver que rien n'a été retenu.
    while (espions.length) espions.pop()?.mockRestore();
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
