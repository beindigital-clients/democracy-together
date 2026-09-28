import { describe, it, expect, vi } from 'vitest';
import { isTransport, retrySync, retryAsync } from '../e2e/_retry';

// The E2E helpers' retry is itself tested: retry logic with nothing
// proving that it retries is a comment, not a fix. The SENSITIVE
// point is the second half — NOT replaying an application error. Without
// it, a Convex validator rejecting an argument would become three seconds
// of waiting followed by the same failure, and the useful message would be drowned.

// Reproduces what Node actually produces: execFileSync throws an Error whose
// `message` carries the command's error output.
function cliError(stderr: string) {
  const err = new Error(`Command failed: npx convex run foo\n${stderr}`);
  // `stderr` is a Uint8Array, NOT a string — verified on a real
  // execFileSync error. Building it as a string here would make the test lenient:
  // it would pass with an implementation incapable of reading a Buffer.
  (err as Error & { stderr: Uint8Array }).stderr = Buffer.from(stderr, 'utf8');
  return err;
}

describe('isTransport', () => {
  it('reconnaît les pannes de transport observées en CI', () => {
    // The two exact forms recorded in the suite's first real run.
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
    // Case where the failure appears ONLY in stderr: this is what distinguishes an
    // actual read of the field from a mere test of `message`.
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
    expect(calls).toBe(1); // the heart of the test: a SINGLE attempt
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
