import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['audit/poc/**/*.test.ts'] },
});
