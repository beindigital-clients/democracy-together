import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from 'next-sanity';
import {
  client,
  clientOptions,
  SANITY_READ_TIMEOUT_MS,
} from '@dt-sanity/lib/client';

// UNE LECTURE SANITY QUI NE REVIENT PAS NE DOIT PAS TENIR LA PAGE.
//
// Le défaut que ces gardes couvrent ne se voit NI dans le code NI à l'écran :
// les sept appels publics (six modules) replient déjà proprement (F-02, `fetchOrFallback`),
// la page finit par rendre 200 avec son contenu local, et rien n'est journalisé
// côté `src/lib/home.ts`. Seule la DURÉE trahit la panne — mesuré sur le
// serveur de production, 13,9 s pour `/fr` quand l'hôte accepte la connexion
// sans jamais répondre.
//
// La leçon que le second test grave : `timeout` seul ne borne rien, parce que
// le client rejoue la requête. Mesuré, `timeout: 3000` sans couper les réessais
// rejette après 21,4 s — sept fois la valeur demandée. C'est exactement le
// genre de correctif qu'on croit posé et qui ne l'est pas.

/** Serveur qui ACCEPTE la requête et ne répond jamais. */
function serveurMuet() {
  const gardees: http.ServerResponse[] = [];
  const srv = http.createServer((_req, res) => {
    gardees.push(res); // conservée ouverte, aucune écriture
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
      // MÊMES options que l'application — seule la destination change. Recopier
      // une configuration à la main la laisserait diverger en silence.
      const sonde = createClient({
        ...clientOptions,
        useCdn: false,
        useProjectHostname: false,
        apiHost: `http://127.0.0.1:${port}`,
      });

      const t0 = Date.now();
      await expect(sonde.fetch('*[_type == "post"][0]')).rejects.toThrow();
      const ecoule = Date.now() - t0;

      // Borne haute : avec les réessais par défaut, la mesure était de l'ordre
      // de sept fois le délai. Un facteur deux les exclut sans être fragile.
      expect(
        ecoule,
        `rendu la main en ${ecoule} ms, soit au-delà du double de la borne : les réessais sont revenus`,
      ).toBeLessThan(SANITY_READ_TIMEOUT_MS * 2);

      // Borne basse : si la requête retombait instantanément pour une autre
      // raison (port fermé, hôte refusé), ce test passerait sans rien prouver
      // de la borne. On exige donc qu'elle ait bien ATTENDU.
      expect(
        ecoule,
        `rendu la main en ${ecoule} ms, trop vite pour avoir attendu la borne : la requête a échoué pour une autre raison`,
      ).toBeGreaterThan(SANITY_READ_TIMEOUT_MS * 0.5);
    } finally {
      await muet.fermer();
    }
  }, 30_000);
});
