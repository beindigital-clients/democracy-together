import { describe, it, expect, vi } from 'vitest';
import { isTransport, retrySync, retryAsync } from '../e2e/_retry';

// La reprise des helpers E2E est elle-même testée : une logique de reprise dont
// rien ne prouve qu'elle reprend est un commentaire, pas un correctif. Le point
// SENSIBLE est la seconde moitié — ne PAS rejouer une erreur applicative. Sans
// elle, un validateur Convex qui refuse un argument deviendrait trois secondes
// d'attente suivies du même échec, et le message utile serait noyé.

// Reproduit ce que Node donne réellement : execFileSync lève une Error dont le
// `message` porte la sortie d'erreur de la commande.
function cliError(stderr: string) {
  const err = new Error(`Command failed: npx convex run foo\n${stderr}`);
  // `stderr` est un Uint8Array, PAS une chaîne — vérifié sur une vraie erreur
  // d'execFileSync. Le fabriquer en chaîne ici rendrait le test complaisant :
  // il passerait avec une implémentation incapable de lire un Buffer.
  (err as Error & { stderr: Uint8Array }).stderr = Buffer.from(stderr, 'utf8');
  return err;
}

describe('isTransport', () => {
  it('reconnaît les pannes de transport observées en CI', () => {
    // Les deux formes exactes relevées dans le premier run réel de la suite.
    expect(
      isTransport(
        cliError(
          '✖ Failed to run function "devAdmin:setRoleByEmail":\nTypeError: fetch failed',
        ),
      ),
    ).toBe(true);
    const withCause = new Error('TypeError: fetch failed');
    withCause.cause = new Error('read ECONNRESET');
    expect(isTransport(withCause)).toBe(true);
  });

  it('lit le Buffer `stderr` quand le message seul ne suffit pas', () => {
    // Cas où la panne n'apparaît QUE dans stderr : c'est ce qui distingue une
    // lecture réelle du champ d'un simple test du `message`.
    const err = new Error('Command failed: npx convex run foo');
    (err as Error & { stderr: Uint8Array }).stderr = Buffer.from(
      'TypeError: fetch failed',
      'utf8',
    );
    expect(isTransport(err)).toBe(true);
  });

  it('ne confond pas une erreur applicative avec une panne de transport', () => {
    expect(
      isTransport(
        cliError(
          '✖ Failed to run function "youth:applyYouth":\nArgumentValidationError: Object is missing the required field `email`',
        ),
      ),
    ).toBe(false);
    expect(isTransport(new Error('Uncaught Error: Not authorized'))).toBe(
      false,
    );
  });
});

describe('retrySync', () => {
  it('rejoue une panne de transport puis rend le résultat', () => {
    let calls = 0;
    const out = retrySync('test', () => {
      calls++;
      if (calls < 3) throw cliError('TypeError: fetch failed');
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('remonte IMMÉDIATEMENT une erreur applicative, sans rejouer', () => {
    let calls = 0;
    expect(() =>
      retrySync('test', () => {
        calls++;
        throw cliError('ArgumentValidationError: champ requis manquant');
      }),
    ).toThrow(/ArgumentValidationError/);
    expect(calls).toBe(1); // le cœur du test : UNE seule tentative
  });

  it('abandonne après 4 tentatives et cite la dernière erreur', () => {
    let calls = 0;
    expect(() =>
      retrySync('seed:seedDirectory', () => {
        calls++;
        throw cliError('TypeError: fetch failed');
      }),
    ).toThrow(/seed:seedDirectory.*4 tentatives/s);
    expect(calls).toBe(4);
  });
});

describe('retryAsync', () => {
  it('rejoue une panne de transport puis rend le résultat', async () => {
    let calls = 0;
    const out = await retryAsync('youth:applyYouth', async () => {
      calls++;
      if (calls < 2) {
        const e = new Error('TypeError: fetch failed');
        e.cause = new Error('read ECONNRESET');
        throw e;
      }
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toBe(2);
  });

  it('remonte immédiatement une erreur applicative', async () => {
    const run = vi.fn(async () => {
      throw new Error('Uncaught Error: Not authorized');
    });
    await expect(retryAsync('test', run)).rejects.toThrow(/Not authorized/);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
