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
  | 'devBrowser'
  | 'adminNav'
  | 'adminRecherche'
  | 'enTete'
  | 'adminContact'
  | 'adminModeration';

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
  // Les deux fichiers de l'issue #49 prennent CHACUN la leur. La règle
  // ci-dessus n'énonce pas un seuil de trois fichiers : elle décrit un
  // mécanisme qui mord dès que DEUX contextes présentent le même jeton de
  // rafraîchissement, et l'issue #38 raconte seulement le moment où il s'est
  // vu. Playwright exécutant les FICHIERS en parallèle, deux fichiers sur un
  // compte suffisent à l'armer.
  //
  // À noter, parce que la confusion a coûté une campagne de CI : ce n'était
  // PAS la cause de l'échec de `admin-recherche` (il est tombé pareil avec sa
  // session à lui). Ce fichier a cinq parcours, donc cinq contextes tirés du
  // même état, et c'est le dernier qui se réveillait sur l'écran de connexion
  // — le cas INTRA-fichier, que `admin-confirmations.spec.ts` corrige en
  // réécrivant l'état après chaque test. Les deux précautions sont distinctes,
  // et les deux sont nécessaires ici.
  //
  // Rang administrateur pour les deux : les écrans exercés (utilisateurs,
  // journal) sont précisément ceux que ce rang réserve.
  adminNav: {
    email: 'e2e_session_admin_nav@democracytogether.test',
    state: 'tests/e2e/.auth/admin-nav.json',
    role: 'admin',
  },
  adminRecherche: {
    email: 'e2e_session_admin_recherche@democracytogether.test',
    state: 'tests/e2e/.auth/admin-recherche.json',
    role: 'admin',
  },
  // Session dédiée à `header-stabilite.spec.ts` (audit F-13, cas CONNECTÉ).
  // Elle applique la règle ci-dessus : un fichier, sa session. Le rang le plus
  // bas suffit — ce qui est mesuré est la largeur de l'en-tête d'un visiteur
  // connecté, pas un écran réservé.
  enTete: {
    email: 'e2e_session_en_tete@democracytogether.test',
    state: 'tests/e2e/.auth/en-tete.json',
    role: 'membre',
  },
  // Session dédiée à `admin-contact.spec.ts` (audit F-12). Ce fichier écrit un
  // message par le formulaire PUBLIC puis le traite depuis le back-office : il
  // tient donc sa session d'un bout à l'autre, exactement le cas que la règle
  // ci-dessus vise.
  //
  // Rang MODÉRATEUR, et pas plus : c'est ce qu'exigent `contact.listMessages`
  // et `contact.setHandled`. Prendre un administrateur « pour être tranquille »
  // ferait passer le test même le jour où la garde serait relevée par erreur —
  // le rang minimal est ce qui rend l'écran vérifié.
  adminContact: {
    email: 'e2e_session_admin_contact@democracytogether.test',
    state: 'tests/e2e/.auth/admin-contact.json',
    role: 'moderateur',
  },
  // Session dédiée à `admin-moderation.spec.ts`.
  //
  // CE FICHIER PARTAGEAIT `moderateur` AVEC `admin-ecrans.spec.ts`, et il
  // l'annonçait lui-même — son `describe` s'intitulait « session modérateur
  // PARTAGÉE ». C'est exactement ce que la règle ci-dessus proscrit, et le
  // symptôme décrit s'est produit : en CI, le test s'est réveillé sur
  // `/connexion` au milieu de son parcours, l'instantané d'échec montrant la
  // page de connexion et le bouton « Approuver » détaché du DOM.
  //
  // Il écrit la candidature par le chemin public PUIS la modère : il tient
  // donc sa session d'un bout à l'autre. Rang modérateur, celui qu'il exerce.
  adminModeration: {
    email: 'e2e_session_admin_moderation@democracytogether.test',
    state: 'tests/e2e/.auth/admin-moderation.json',
    role: 'moderateur',
  },
};
