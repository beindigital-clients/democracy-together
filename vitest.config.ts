import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same aliases as tsconfig.json: `@convex` is used for imports of VALUES
    // shared between the backend and the UI (directory vocabulary, facets),
    // not only for type imports — those are erased at
    // compile time and therefore never needed to be resolved here.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@convex': fileURLToPath(new URL('./convex', import.meta.url)),
    },
  },
  test: {
    // `next-intl` is TRANSFORMED rather than loaded as is. Its localized
    // navigation (`createNavigation`) imports `next/navigation` without an extension:
    // left external, Vite cannot resolve it from pnpm's nested
    // node_modules and the test fails at import, before any assertion.
    // That is what prevented testing a component carrying one of the repo's
    // `<Link>`s — the back-office navigation, for example (issue #49).
    server: { deps: { inline: [/next-intl/] } },
    include: [
      'convex/**/*.test.ts',
      'tests/unit/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
  },
});
