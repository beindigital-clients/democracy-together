import { describe, it, expect } from 'vitest';
import { convexCspOrigins } from '@/lib/convex-origins';

// CSP et déploiement Convex hors cloud (auto-hébergé / local). Voir le module.
describe('convexCspOrigins', () => {
  it("n'ajoute rien pour un déploiement du cloud Convex (CSP de prod inchangée)", () => {
    expect(convexCspOrigins('https://happy-animal-123.convex.cloud')).toEqual({
      connect: [],
      img: [],
    });
  });

  it("n'ajoute rien sans URL, ou avec une URL illisible", () => {
    expect(convexCspOrigins(undefined)).toEqual({ connect: [], img: [] });
    expect(convexCspOrigins('')).toEqual({ connect: [], img: [] });
    expect(convexCspOrigins('pas une url')).toEqual({ connect: [], img: [] });
    expect(convexCspOrigins('file:///etc/passwd')).toEqual({
      connect: [],
      img: [],
    });
  });

  it('ouvre http + ws pour un déploiement local (`npx convex dev --local`)', () => {
    expect(convexCspOrigins('http://127.0.0.1:3210')).toEqual({
      connect: ['http://127.0.0.1:3210', 'ws://127.0.0.1:3210'],
      img: ['http://127.0.0.1:3210'],
    });
  });

  it('ouvre https + wss pour un déploiement auto-hébergé', () => {
    expect(convexCspOrigins('https://convex.exemple.eu/')).toEqual({
      connect: ['https://convex.exemple.eu', 'wss://convex.exemple.eu'],
      img: ['https://convex.exemple.eu'],
    });
  });

  it("ne retient que l'origine, jamais le chemin ni les identifiants", () => {
    expect(
      convexCspOrigins('https://user:pw@convex.exemple.eu:8443/api?x=1'),
    ).toEqual({
      connect: [
        'https://convex.exemple.eu:8443',
        'wss://convex.exemple.eu:8443',
      ],
      img: ['https://convex.exemple.eu:8443'],
    });
  });
});
