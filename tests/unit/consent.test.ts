// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONSENT_KEY,
  readConsent,
  writeConsent,
  hasAnalyticsConsent,
  type ConsentValue,
} from '@/lib/consent';

// Cookie consent (F-09) — a GDPR concern, with no coverage until now.
//
// The property that matters is not "the preference is read back correctly": it is
// that NOTHING other than an explicitly recorded "all" counts as consent.
// The module is written to GATE future audience measurement; the day a
// measurement tool is plugged into it, every case where `hasAnalyticsConsent()` returned
// `true` by accident — missing value, corrupted value, unavailable storage,
// server render — would be a tracker dropped without consent.
//
// The module's four exit paths are therefore exercised here, and all must
// CLOSE (`null` / `false`), never open.

// Spies are restored ONE BY ONE, not via `vi.restoreAllMocks()`
// (audit F-01).
//
// Measured: under happy-dom and Vitest 4, `restoreAllMocks()` does NOT restore a
// spy set on the `window.localStorage` instance. The `SecurityError` from the
// "stockage indisponible" test therefore survived the `afterEach` and contaminated the
// following ones. In declaration order — the CI one — the suite stayed green;
// in shuffled order it went red six times out of ten, up to twelve tests at
// once. Green by luck of ordering, then.
//
// The trap is silent: any test added after these inherited a
// `localStorage` that throws, and would have failed for a reason unrelated to its
// subject — or, worse, would have passed without exercising anything.
//
// `mockRestore()` on the spy itself does work: verified before
// writing this fix (`audit/poc/restore-fix.test.ts`). Manually putting it back
// (`window.localStorage.getItem = origine`) does NOT work — happy-dom's
// proxy ignores the assignment.
const espions: { mockRestore: () => void }[] = [];

/** Sets a spy and registers it for explicit restoration. */
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
    // `null` and not "essential": the banner must be shown as long as the
    // visitor has not decided. Confusing the two would make it disappear without
    // anyone having chosen anything.
    expect(readConsent()).toBeNull();
  });

  it.each<ConsentValue>(['all', 'essential'])('relit le choix « %s »', (v) => {
    writeConsent(v);
    expect(readConsent()).toBe(v);
  });

  it('écrit sous une clé stable', () => {
    // The key is the contract with visitors who have already been here: renaming it
    // would ask everyone for their consent again.
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

  // An unexpected value is not consent: an extension tampering with
  // storage, an old format, another tool writing on the same origin.
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

  // Server render: the module is imported by a client component, but the
  // first render happens without `window`. Throwing here would break the page; returning
  // `true` would drop a tracker on behalf of a visitor who said nothing.
  it('sans `window` (rendu serveur), ferme sans lever', () => {
    vi.stubGlobal('window', undefined);
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(() => writeConsent('all')).not.toThrow();
  });

  // Private browsing, third-party cookies blocked, full quota: storage access
  // THROWS instead of returning `null`. The banner must remain usable — and, here
  // too, failure must not count as consent.
  it('stockage indisponible : ferme sans lever, à la lecture comme à l’écriture', () => {
    const indisponible = () => {
      throw new DOMException('refusé', 'SecurityError');
    };
    // On the INSTANCE: happy-dom serves `localStorage` behind a proxy, and a
    // patch set on `Storage.prototype` would never be reached — the test
    // would then pass without exercising anything at all.
    espionner('getItem', indisponible);
    espionner('setItem', indisponible);

    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(() => writeConsent('all')).not.toThrow();
  });

  it('une écriture perdue ne se transforme pas en consentement mémorisé', () => {
    // The visitor clicks "Tout accepter" while storage is blocked:
    // the click does not throw, but nothing was kept — the next read must
    // say so, not pretend the choice held.
    espionner('setItem', () => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    writeConsent('all');
    // Restored HERE, mid-test: the rest of the scenario needs
    // storage that works again to prove nothing was kept.
    while (espions.length) espions.pop()?.mockRestore();
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
