// Replays an operation whose failure is a TRANSPORT incident, never an
// application error. The suite talks to a remote Convex deployment, and each
// call below opens its own connection: `getOtp` triggers up to 24 of them
// for a single sign-in. Under this burst, the first real run of the
// E2E tests produced 18 `TypeError: fetch failed` and 4 `ECONNRESET` — yet the preview
// was responding (the workflow's seed had just passed).
//
// The filter is deliberately NARROW: we only replay the transport failures
// named below. A Convex function that throws (validator,
// authorization, invalid argument) surfaces immediately — otherwise an
// application defect would become a 3-second wait followed by the same failure,
// only less readable.
const TRANSPORT =
  /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|Connection closed/i;

// Flattens into text what an error may carry. `execFileSync` throws an Error
// whose `stderr` is a Uint8Array (verified, not assumed) and whose `message`
// ALREADY contains the error output; `ConvexHttpClient`, for its part, chains
// the network failure in `cause`. We read all three, without ever letting an
// object fall into `[object Object]`.
function text(value: unknown, depth = 0): string {
  if (value == null || depth > 3) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  if (value instanceof Error) {
    return `${value.message} ${text(value.cause, depth + 1)}`;
  }
  return '';
}

export function isTransport(err: unknown): boolean {
  const e = err as { stderr?: unknown };
  return TRANSPORT.test(`${text(err)} ${text(e?.stderr)}`);
}

export function retrySync<T>(label: string, run: () => T): T {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return run();
    } catch (err) {
      if (!isTransport(err)) throw err;
      last = err;
      // 300 ms, 600 ms, 1200 ms — busy wait, on purpose: these helpers are
      // synchronous (execFileSync), and making them asynchronous would change the
      // signature of half the specs for zero gain.
      const wait = 300 * 2 ** (attempt - 1);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  throw new Error(
    `${label} : échec de transport après 4 tentatives. Dernière erreur :\n${String(last)}`,
  );
}

export async function retryAsync<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isTransport(err)) throw err;
      last = err;
      await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(
    `${label} : échec de transport après 4 tentatives. Dernière erreur :\n${String(last)}`,
  );
}
