import { defineCliConfig } from 'sanity/cli';

// Config CLI Sanity (distincte de sanity.config.ts qui sert le Studio).
// Permet `npx sanity exec ... --with-user-token` et les commandes CLI.

// Pas de repli en dur sur un projectId (issue #44). Un projectId Sanity n'est
// pas un secret — il circule dans le navigateur — mais un défaut SILENCIEUX
// masque une erreur de configuration : le développeur qui oublie la variable
// croit travailler sur son projet pendant que la CLI en vise un autre, et
// selon les droits de son jeton il peut y déployer un schéma ou y écrire un
// seed (`npx sanity exec scripts/seed-*.ts`). Même logique que `sendEmail`
// (convex/email.ts) : une erreur franche vaut mieux qu'un succès trompeur.
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
