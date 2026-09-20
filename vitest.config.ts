import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mêmes alias que tsconfig.json : `@convex` sert aux imports de VALEURS
    // partagées entre le backend et l'UI (vocabulaire de l'annuaire, facettes),
    // pas seulement aux imports de types — ceux-ci sont effacés à la
    // compilation et n'ont donc jamais eu besoin d'être résolus ici.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@convex': fileURLToPath(new URL('./convex', import.meta.url)),
    },
  },
  test: {
    // `next-intl` est TRANSFORMÉ plutôt que chargé tel quel. Sa navigation
    // localisée (`createNavigation`) importe `next/navigation` sans extension :
    // laissé externe, Vite ne sait pas le résoudre depuis les node_modules
    // imbriqués de pnpm et le test échoue à l'import, avant tout assertion.
    // C'est ce qui empêchait de tester un composant portant un `<Link>` du
    // dépôt — la navigation du back-office, par exemple (issue #49).
    server: { deps: { inline: [/next-intl/] } },
    include: [
      'convex/**/*.test.ts',
      'tests/unit/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
  },
});
