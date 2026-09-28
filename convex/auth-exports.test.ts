import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Anti-regression guard (issue #66).
//
// `convex/auth.ts` did not export `isAuthenticated`, mandatory since
// convex-auth 0.0.76. Consequence: `convexAuthNextjsMiddleware` (src/proxy.ts)
// called a function missing from the deployment on every request to a
// protected route, and EVERY authenticated page responded 500 — member area and
// back office included.
//
// This defect is invisible when signed out: that is why it got through the audit, the
// review and 300 unit tests. It took a session existing for it to
// show up, which the E2E suite had never reached.
//
// The file touches `process.env` on load and stays excluded from the glob of all
// test files: we therefore read its SOURCE, as dev-oracles.test.ts
// does for the DEV oracles.
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
