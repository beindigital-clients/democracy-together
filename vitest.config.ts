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
    include: [
      'convex/**/*.test.ts',
      'tests/unit/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
  },
});
