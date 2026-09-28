import { createClient } from 'next-sanity';
import { apiVersion, dataset, projectId } from '../env';

// A READ THAT DOES NOT COME BACK MUST NOT HOLD UP THE PAGE.
//
// The seven public calls to this client, spread across six modules, all fall back to local content
// when the request FAILS — that is the work of F-02 and `fetchOrFallback`,
// and it is complete. But a `catch` only runs once the request has
// FINISHED. As long as it has not, server rendering waits, and the best-written
// fallback in the world is of no use.
//
// Measured on the production server, with a Sanity host accepting the connection without
// ever responding: `/fr` took 13.9 s — and rendered 200, via the fallback, after
// the fact. Without anything being logged, since the `catch` in `src/lib/home.ts`
// is silent.
//
// WHY `timeout` IS NOT ENOUGH. The client RETRIES a failed request, and the
// delay is paid once per attempt: measured, `timeout: 3000` alone rejects
// after 21.4 s, not 3. Retries are therefore disabled. They would only help
// if the outage were shorter than the delay, and they cost their duration on
// EVERY page for as long as it lasts — whereas the local fallback is complete and
// immediate. Better the local content in 2.5 s than the Sanity content in 21.
//
// The bound is ~50 times the nominal latency of the Sanity CDN (a few tens
// of milliseconds): it cannot trigger on a healthy read.
//
// The Studio is NOT affected: it mounts `sanity.config` and not this client. The
// editor's long operations therefore keep their behavior.
export const SANITY_READ_TIMEOUT_MS = 2_500;

// Exported so that the guard can build a client WITH THESE VERY OPTIONS
// and point it at a silent server, rather than rewriting a configuration
// that would diverge from this one without anything flagging it.
export const clientOptions = {
  projectId,
  dataset,
  apiVersion,
  // Public reads (CDN, fast). For draft mode: useCdn:false + token.
  useCdn: true,
  timeout: SANITY_READ_TIMEOUT_MS,
  maxRetries: 0,
} as const;

export const client = createClient(clientOptions);
