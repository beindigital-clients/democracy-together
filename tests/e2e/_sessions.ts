// « Fichier de login » — des sessions pré-ouvertes, une par rôle (issue #66).
//
// POURQUOI. Chaque spec de back-office rejouait un parcours de connexion
// complet avant d'aborder son vrai sujet : provisionnement du compte, création
// du mot de passe, lecture du code, écran de connexion. C'est long, répété
// quinze fois, et surtout c'est quinze occasions d'échouer pour une raison qui
// n'est pas celle qu'on teste — les quinze specs mortes à la même ligne, sur un
// helper de mot de passe qui ne pouvait pas fonctionner, en sont la
// démonstration.
//
// Playwright répond à cela par l'état de navigation sauvegardé : la session est
// ouverte UNE fois, dans un projet `setup` qui s'exécute avant les autres, et
// chaque spec repart du fichier produit. Une spec de back-office commence
// désormais connectée, au rôle qu'elle demande.
//
// CE QUI N'EST PAS COURT-CIRCUITÉ. Les parcours d'AUTHENTIFICATION eux-mêmes —
// `auth.spec`, `auth-negative`, `auth-reset`, `auth-otp`, `en-journey` — passent
// toujours par l'interface : s'y connecter EST leur sujet. Un fichier de
// session y ôterait ce qu'elles vérifient.
//
// ADRESSES STABLES. Une préversion CI naît vide, mais un déploiement de dev
// vit longtemps : les comptes sont donc réutilisés d'une exécution à l'autre.
// C'est sans danger — `provisionUser` fait un upsert, et `provisionPassword`
// relie le même mot de passe à un compte qui l'a déjà (vérifié : un second
// `signUp` avec le même secret aboutit, il ne crée pas de doublon).

export const SESSION_PASSWORD = 'session-e2e-partagee-2026';

export type SessionRole = 'membre' | 'moderateur' | 'editeur' | 'admin';

export const SESSIONS: Record<SessionRole, { email: string; state: string }> = {
  membre: {
    email: 'e2e_session_membre@democracytogether.test',
    state: 'tests/e2e/.auth/membre.json',
  },
  moderateur: {
    email: 'e2e_session_moderateur@democracytogether.test',
    state: 'tests/e2e/.auth/moderateur.json',
  },
  editeur: {
    email: 'e2e_session_editeur@democracytogether.test',
    state: 'tests/e2e/.auth/editeur.json',
  },
  admin: {
    email: 'e2e_session_admin@democracytogether.test',
    state: 'tests/e2e/.auth/admin.json',
  },
};
