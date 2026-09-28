import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from 'next-sanity';
import {
  client,
  clientOptions,
  SANITY_READ_TIMEOUT_MS,
} from '@dt-sanity/lib/client';

// A SANITY READ THAT NEVER COMES BACK MUST NOT HOLD UP THE PAGE.
//
// The defect these guards cover shows up NEITHER in the code NOR on screen:
// the seven public calls (six modules) already fall back cleanly (F-02, `fetchOrFallback`),
// the page ends up rendering 200 with its local content, and nothing is logged
// on the `src/lib/home.ts` side. Only the DURATION betrays the outage — measured on the
// production server, 13.9 s for `/fr` when the host accepts the connection
// without ever responding.
//
// The lesson the second test engraves: `timeout` alone bounds nothing, because
// the client replays the request. Measured, `timeout: 3000` without cutting retries
// rejects after 21.4 s — seven times the requested value. It is exactly the
// kind of fix one believes is in place and is not.

/** Server that ACCEPTS the request and never responds. */
function serveurMuet() {
  const gardees: http.ServerResponse[] = [];
  const srv = http.createServer((_req, res) => {
    gardees.push(res); // kept open, no write
  });
  return {
    srv,
    ecouter: () =>
      new Promise<number>((resolve) => {
        srv.listen(0, '127.0.0.1', () =>
          resolve((srv.address() as AddressInfo).port),
        );
      }),
    fermer: () =>
      new Promise<void>((resolve) => {
        for (const r of gardees) r.destroy();
        srv.close(() => resolve());
      }),
  };
}

describe('Sanity — borne de temps sur les lectures publiques', () => {
  it('le client exporté porte une borne finie et courte', () => {
    const cfg = client.config();
    expect(
      cfg.timeout,
      'sans `timeout`, le client attend la valeur par défaut du paquet',
    ).toBe(SANITY_READ_TIMEOUT_MS);
    expect(Number.isFinite(cfg.timeout)).toBe(true);
    expect(
      cfg.timeout,
      'une borne au-delà de quelques secondes ne protège plus le rendu serveur',
    ).toBeLessThanOrEqual(5_000);
  });

  it('les réessais sont coupés — sinon la borne est multipliée', () => {
    expect(
      client.config().maxRetries,
      '`timeout: 3000` avec les réessais par défaut a été mesuré à 21,4 s',
    ).toBe(0);
  });

  it("une lecture que l'hôte n'honore jamais rend la main dans la borne", async () => {
    const muet = serveurMuet();
    const port = await muet.ecouter();
    try {
      // SAME options as the application — only the destination changes. Copying
      // a configuration by hand would let it diverge silently.
      const sonde = createClient({
        ...clientOptions,
        useCdn: false,
        useProjectHostname: false,
        apiHost: `http://127.0.0.1:${port}`,
      });

      const t0 = Date.now();
      await expect(sonde.fetch('*[_type == "post"][0]')).rejects.toThrow();
      const ecoule = Date.now() - t0;

      // Upper bound: with the default retries, the measurement was around
      // seven times the timeout. A factor of two excludes them without being fragile.
      expect(
        ecoule,
        `rendu la main en ${ecoule} ms, soit au-delà du double de la borne : les réessais sont revenus`,
      ).toBeLessThan(SANITY_READ_TIMEOUT_MS * 2);

      // Lower bound: if the request failed instantly for another
      // reason (closed port, refused host), this test would pass without proving anything
      // about the bound. So we require that it did WAIT.
      expect(
        ecoule,
        `rendu la main en ${ecoule} ms, trop vite pour avoir attendu la borne : la requête a échoué pour une autre raison`,
      ).toBeGreaterThan(SANITY_READ_TIMEOUT_MS * 0.5);
    } finally {
      await muet.fermer();
    }
  }, 30_000);
});
