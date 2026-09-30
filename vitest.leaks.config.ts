// TEMPORARY diagnostic config, not committed.
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

export default mergeConfig(
  base,
  defineConfig({ test: { setupFiles: ['./leak-detector.setup.ts'] } }),
);
