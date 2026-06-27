import { defineCliConfig } from 'sanity/cli';

// Config CLI Sanity (distincte de sanity.config.ts qui sert le Studio).
// Permet `npx sanity exec ... --with-user-token` et les commandes CLI.
export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'r13jrmlx',
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  },
});
