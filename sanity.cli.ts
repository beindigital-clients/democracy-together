import { defineCliConfig } from 'sanity/cli';

// Sanity CLI config (separate from sanity.config.ts, which serves the Studio).
// Enables `npx sanity exec ... --with-user-token` and the CLI commands.

// No hard-coded fallback projectId (issue #44). A Sanity projectId is
// not a secret — it circulates in the browser — but a SILENT default
// masks a configuration error: the developer who forgets the variable
// thinks they are working on their project while the CLI targets another one, and
// depending on their token's rights they may deploy a schema to it or write a
// seed into it (`npx sanity exec scripts/seed-*.ts`). Same logic as `sendEmail`
// (convex/email.ts): an outright error is better than a misleading success.
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
if (!projectId) {
  throw new Error(
    'SANITY_PROJECT_ID_NOT_CONFIGURED : NEXT_PUBLIC_SANITY_PROJECT_ID est absente. Renseignez-la dans `.env.local` (voir `.env.example`), ou passez-la le temps d’une commande : NEXT_PUBLIC_SANITY_PROJECT_ID=xxxxxxxx npx sanity …',
  );
}

export default defineCliConfig({
  api: {
    projectId,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  },
});
