import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Garde anti-régression (issue #66).
//
// `convex/auth.ts` n'exportait pas `isAuthenticated`, obligatoire depuis
// convex-auth 0.0.76. Conséquence : `convexAuthNextjsMiddleware` (src/proxy.ts)
// appelait une fonction absente du déploiement à chaque requête vers une route
// protégée, et TOUTE page authentifiée répondait 500 — espace membre et
// back-office compris.
//
// Ce défaut est invisible déconnecté : c'est pourquoi il a traversé l'audit, la
// revue et 300 tests unitaires. Il a fallu qu'une session existe pour qu'il se
// manifeste, ce que la suite E2E n'avait jamais atteint.
//
// Le fichier touche `process.env` au chargement et reste exclu du glob de tous
// les fichiers de test : on lit donc sa SOURCE, comme dev-oracles.test.ts le
// fait pour les oracles DEV.
const here = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(`${here}auth.ts`, 'utf8');

describe('convex/auth.ts — exports exigés par Convex Auth', () => {
  it.each(['auth', 'signIn', 'signOut', 'store', 'isAuthenticated'])(
    '%s figure dans les exports de convexAuth()',
    (name) => {
      const line = /export const \{([^}]*)\} = convexAuth\(/.exec(source)?.[1];
      expect(
        line,
        'la déstructuration de convexAuth() doit exister',
      ).toBeTruthy();
      expect(line?.split(',').map((s) => s.trim())).toContain(name);
    },
  );
});
