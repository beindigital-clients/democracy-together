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

// UN COMPTE, DEUX FICHIERS EN MÊME TEMPS : LA SESSION MEURT. Playwright
// exécute les FICHIERS en parallèle — `fullyParallel: false` ne sérialise que
// l'intérieur d'un fichier. Deux contextes repartis du même état présentent
// donc le MÊME jeton de rafraîchissement ; Convex Auth le fait tourner à
// chaque renouvellement, si bien que le second passage ressemble à un rejeu et
// que la session est invalidée. Le symptôme n'est pas un test lent mais un
// test qui se réveille sur /connexion, au milieu de son parcours — et jamais
// le même d'une exécution à l'autre.
//
// Constaté sur l'issue #38 : en ajoutant un TROISIÈME fichier sur la session
// modérateur (et un troisième sur la session admin), `admin-moderation` puis
// `admin.spec` sont tombés sur l'écran de connexion, en alternance. D'où la
// règle tenue ici : quand un fichier de spec tient une session longtemps (il
// écrit une donnée, puis la modère), il prend sa PROPRE session plutôt que de
// s'ajouter à la file d'attente d'un compte partagé.
//
// Le rôle n'est donc plus la clé : une session dédiée porte le rôle dont elle
// a besoin, et son entrée dit à quel fichier elle appartient.

export const SESSION_PASSWORD = 'session-e2e-partagee-2026';

// Même vocabulaire que `convex/lib/roles`, redéclaré ici comme dans
// `_helpers.ts` : ces fichiers ne dépendent que de Playwright.
type NetworkRole = 'membre' | 'moderateur' | 'editeur' | 'admin';

export type SessionKey =
  | 'membre'
  | 'moderateur'
  | 'editeur'
  | 'admin'
  | 'confirmations'
  | 'devBrowser';

export const SESSIONS: Record<
  SessionKey,
  { email: string; state: string; role: NetworkRole }
> = {
  membre: {
    email: 'e2e_session_membre@democracytogether.test',
    state: 'tests/e2e/.auth/membre.json',
    role: 'membre',
  },
  moderateur: {
    email: 'e2e_session_moderateur@democracytogether.test',
    state: 'tests/e2e/.auth/moderateur.json',
    role: 'moderateur',
  },
  editeur: {
    email: 'e2e_session_editeur@democracytogether.test',
    state: 'tests/e2e/.auth/editeur.json',
    role: 'editeur',
  },
  admin: {
    email: 'e2e_session_admin@democracytogether.test',
    state: 'tests/e2e/.auth/admin.json',
    role: 'admin',
  },
  // Session dédiée à `admin-confirmations.spec.ts` (issue #38). Ses quatre
  // parcours écrivent la donnée PUIS la modèrent : ils tiennent une session de
  // bout en bout, et les gardes du back-office étant hiérarchiques, un seul
  // compte de rang administrateur suffit aux deux bouts.
  confirmations: {
    email: 'e2e_session_confirmations@democracytogether.test',
    state: 'tests/e2e/.auth/confirmations.json',
    role: 'admin',
  },
  // Session dédiée à `dev-browser.spec.ts` (issue #50). Elle est tenue d'un
  // bout à l'autre du projet `dev-browser`, donc longtemps : la règle
  // ci-dessus s'applique. Rang administrateur, parce que ce fichier capture le
  // back-office ET l'espace membre — les gardes étant hiérarchiques, un seul
  // compte couvre les deux écrans, et une seule connexion de plus est payée.
  devBrowser: {
    email: 'e2e_session_dev_browser@democracytogether.test',
    state: 'tests/e2e/.auth/dev-browser.json',
    role: 'admin',
  },
};
